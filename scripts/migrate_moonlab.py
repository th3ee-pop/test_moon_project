#!/usr/bin/env python3
"""
把月相实验室的埋点数据从一个 CloudBase 环境整体搬到另一个环境。

用法：
    python3 scripts/migrate_moonlab.py --source <envA> --target <envB> --dry-run   # 只导出并报告
    python3 scripts/migrate_moonlab.py --source <envA> --target <envB>             # 实际写入

也可以用环境变量给，避免环境 ID 进命令行历史：
    MOONLAB_SOURCE_ENV=<envA> MOONLAB_TARGET_ENV=<envB> python3 scripts/migrate_moonlab.py

前置条件：目标环境已建好表结构（见 cloudbase/migrations/），本机已登录 tcb CLI
（脚本内部调 `tcb db execute -e <envId> --sql ... --json`）。

写入统一用 `on conflict (id) do nothing`，因此可以重复执行而不会产生重复行——
中断后直接重跑即可，已经搬过去的部分会被跳过。
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

WORKDIR = Path(__file__).resolve().parents[1]

# 表 -> (列名, 排序键, 每批行数, jsonb 列)
TABLES: list[tuple[str, list[str], str, int, set[str]]] = [
    (
        "moonlab_sessions",
        [
            "id", "student_name", "class_name", "started_at", "ended_at",
            "duration_ms", "score", "total_questions", "completed",
            "task_version", "user_agent",
        ],
        "started_at",
        100,
        set(),
    ),
    (
        "moonlab_events",
        [
            "id", "session_id", "seq", "event_type", "phase", "payload",
            "client_ts", "created_at",
        ],
        "created_at, id",
        50,
        {"payload"},
    ),
    (
        "moonlab_answers",
        [
            "id", "session_id", "question_id", "question_type", "prompt",
            "answer", "correct_answer", "is_correct", "attempt",
            "duration_ms", "created_at",
        ],
        "created_at, id",
        50,
        {"answer", "correct_answer"},
    ),
]


def run_sql(env: str, sql: str) -> dict:
    """调用 tcb CLI 执行 SQL，返回解析后的 JSON。"""
    proc = subprocess.run(
        ["tcb", "db", "execute", "-e", env, "--sql", sql, "--json"],
        cwd=WORKDIR,
        capture_output=True,
        text=True,
    )
    out = proc.stdout
    start = out.find("{")
    if start < 0:
        raise RuntimeError(f"tcb 没有返回 JSON：\n{out}\n{proc.stderr}")
    payload = json.loads(out[start:])
    # 失败时 CLI 返回 {"error": {...}}，没有 data 键
    if "data" not in payload:
        raise RuntimeError(f"SQL 执行失败：{json.dumps(payload, ensure_ascii=False)[:600]}")
    return payload


def dump_table(env: str, table: str, order_by: str) -> list[dict]:
    """把整张表导成 Python 列表（一次查询，json_agg 聚合成单个文本字段）。"""
    sql = (
        "select coalesce(json_agg(t), '[]'::json)::text as payload "
        f"from (select * from public.{table} order by {order_by}) t"
    )
    data = run_sql(env, sql)
    rows = data["data"]["Rows"]
    if not rows:
        return []
    encoded = json.loads(rows[0])  # ["[{...},{...}]"]
    return json.loads(encoded[0]) if encoded else []


def lit(value, is_jsonb: bool) -> str:
    """把 Python 值转成 SQL 字面量。standard_conforming_strings 默认开启，反斜杠无需转义。"""
    if value is None:
        return "NULL"
    # jsonb 必须先判断：jsonb 里可能存数字、字符串、布尔，不能按 Python 类型直接落字面量
    if is_jsonb:
        text = json.dumps(value, ensure_ascii=False)
        return "'" + text.replace("'", "''") + "'::jsonb"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, (int, float)):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


def build_insert(table: str, columns: list[str], jsonb_cols: set[str], rows: list[dict]) -> str:
    values = []
    for row in rows:
        cells = ", ".join(lit(row.get(col), col in jsonb_cols) for col in columns)
        values.append(f"({cells})")
    cols = ", ".join(columns)
    return (
        f"insert into public.{table} ({cols}) values\n" + ",\n".join(values) +
        "\non conflict (id) do nothing"
    )


def count_rows(env: str, table: str) -> int:
    data = run_sql(env, f"select count(*)::int as n from public.{table}")
    encoded = json.loads(data["data"]["Rows"][0])
    # CLI 有时把数值包成 ["27"]、有时直接给 ["[27]"]，两种都兼容
    value = json.loads(encoded[0]) if isinstance(encoded[0], str) else encoded[0]
    if isinstance(value, list):
        value = value[0]
    return int(value)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="跨 CloudBase 环境迁移月相实验室埋点数据（幂等，可重跑）",
    )
    parser.add_argument(
        "--source",
        default=os.environ.get("MOONLAB_SOURCE_ENV", ""),
        help="源环境 ID，也可用环境变量 MOONLAB_SOURCE_ENV",
    )
    parser.add_argument(
        "--target",
        default=os.environ.get("MOONLAB_TARGET_ENV", ""),
        help="目标环境 ID，也可用环境变量 MOONLAB_TARGET_ENV",
    )
    parser.add_argument("--dry-run", action="store_true", help="只导出，不写入目标库")
    args = parser.parse_args()

    if not args.source or not args.target:
        parser.error("必须同时给出 --source 与 --target（或 MOONLAB_SOURCE_ENV / MOONLAB_TARGET_ENV）")
    if args.source == args.target:
        parser.error("源环境和目标环境相同，无需迁移")

    print(f"源：{args.source}\n目标：{args.target}\n")

    summary = []
    for table, columns, order_by, batch, jsonb_cols in TABLES:
        rows = dump_table(args.source, table, order_by)
        print(f"[导出] {table}: {len(rows)} 行")

        if args.dry_run:
            summary.append((table, len(rows), None))
            continue

        written = 0
        for i in range(0, len(rows), batch):
            chunk = rows[i : i + batch]
            sql = build_insert(table, columns, jsonb_cols, chunk)
            result = run_sql(args.target, sql)
            affected = result["data"].get("AffectedRows", 0)
            written += affected
            print(f"[写入] {table} 第 {i + 1}-{i + len(chunk)} 行 → 新增 {affected} 行")

        target_count = count_rows(args.target, table)
        summary.append((table, len(rows), target_count))

    print("\n=== 结果 ===")
    ok = True
    for table, source_rows, target_rows in summary:
        if target_rows is None:
            print(f"{table:22s} 源 {source_rows:4d} 行（dry-run，未写入）")
            continue
        match = "✓" if target_rows >= source_rows else "✗"
        if target_rows < source_rows:
            ok = False
        print(f"{table:22s} 源 {source_rows:4d} 行 → 目标 {target_rows:4d} 行 {match}")

    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
