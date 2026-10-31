import Link from "next/link";
import { dbEnabled, fetchStats, type QuestionStat } from "@/lib/db";
import { QUESTIONS } from "@/lib/questions";

export const dynamic = "force-dynamic";

const EVENT_LABELS: Record<string, string> = {
  session_start: "开始探究",
  moon_date_change: "调节观测日期",
  phase_name_reveal: "揭晓月相名称",
  question_view: "查看题目",
  option_select: "选择选项",
  option_toggle: "勾选/取消选项",
  order_pick: "排列月相卡",
  order_reset: "重排月相卡",
  hint_open: "打开提示",
  answer_correct: "答对",
  answer_wrong: "答错",
  answer_retry: "重新作答",
  open_submit: "提交开放题",
  session_complete: "完成探究",
};

const QUESTION_LABELS: Record<string, string> = Object.fromEntries(
  QUESTIONS.map((q, i) => [q.id, `第 ${i + 1} 题 · ${q.title.slice(0, 18)}…`]),
);

const OPEN_IDS = new Set(
  QUESTIONS.filter((q) => q.type === "open").map((q) => q.id),
);

/** 把 JSON 形式的答案（如排序题的数组）转成可读文本 */
function readableAnswer(raw: string): string {
  if (!raw) return "（空）";
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.join(" → ");
    if (typeof parsed === "string") return parsed;
    if (parsed && typeof parsed === "object" && "answer" in parsed) {
      return String((parsed as { answer: unknown }).answer);
    }
    return raw;
  } catch {
    return raw;
  }
}

function durationText(sec: number | null | undefined) {
  if (sec === null || sec === undefined) return "—";
  if (sec < 60) return `${Math.round(sec)} 秒`;
  return `${Math.round(sec / 60)} 分钟`;
}

function pct(v: number | null | undefined) {
  if (v === null || v === undefined) return "—";
  return `${Math.round(v)}%`;
}

function num(v: number | null | undefined, digits = 1) {
  if (v === null || v === undefined) return "—";
  return Number(v).toFixed(digits).replace(/\.0$/, "");
}

export default async function Dashboard() {
  if (!dbEnabled) {
    return (
      <main className="shell">
        <header className="topbar">
          <h1>教师看板</h1>
          <Link className="ghost-btn" href="/">
            返回实验室
          </Link>
        </header>
        <section className="card">
          <div className="empty">
            还没有配置数据库连接。
            <br />
            在服务端环境变量里设置 <span className="code">CB_API_KEY</span> 与{" "}
            <span className="code">CB_ENV_ID</span> 后重新部署即可。
          </div>
        </section>
      </main>
    );
  }

  let data: Awaited<ReturnType<typeof fetchStats>> | null = null;
  let error = "";
  try {
    data = await fetchStats();
  } catch (err) {
    error = err instanceof Error ? err.message : "未知错误";
  }

  if (!data) {
    return (
      <main className="shell">
        <header className="topbar">
          <h1>教师看板</h1>
          <Link className="ghost-btn" href="/">
            返回实验室
          </Link>
        </header>
        <section className="card">
          <div className="empty">读取数据失败：{error}</div>
        </section>
      </main>
    );
  }

  const { overview, questions, events, daily, wrong } = data;
  const isEmpty = !overview || overview.sessions === 0;
  const questionRows = [...questions]
    .filter((q) => !OPEN_IDS.has(q.question_id))
    .sort((a, b) => a.question_id.localeCompare(b.question_id));
  const wrongRows = wrong.filter((w) => !OPEN_IDS.has(w.question_id));
  const maxDaily = Math.max(1, ...daily.map((d) => d.sessions));

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">月相观察实验室 · 学习过程数据</p>
          <h1>教师看板</h1>
        </div>
        <div className="topbar-right">
          <Link className="ghost-btn" href="/">
            返回实验室
          </Link>
        </div>
      </header>

      {isEmpty ? (
        <section className="card">
          <div className="empty">
            还没有学生数据。
            <br />
            把首页链接发给学生，或自己先做一次，数据会立刻出现在这里。
          </div>
        </section>
      ) : (
        <>
          <div className="stat-grid">
            <div className="stat">
              <div className="stat-label">参与人次</div>
              <div className="stat-value">
                {overview?.sessions ?? 0}
                <small>次</small>
              </div>
            </div>
            <div className="stat">
              <div className="stat-label">完成率</div>
              <div className="stat-value">{pct(overview?.completion_rate)}</div>
            </div>
            <div className="stat">
              <div className="stat-label">平均答对</div>
              <div className="stat-value">
                {num(overview?.avg_score)}
                <small>/ 5 题</small>
              </div>
            </div>
            <div className="stat">
              <div className="stat-label">平均用时</div>
              <div className="stat-value">
                {durationText(overview?.avg_duration_sec)}
              </div>
            </div>
          </div>

          <div className="board-grid">
            <section className="card">
              <div className="card-head">
                <h2>每题正确率</h2>
                <span className="muted">按答题人次统计</span>
              </div>
              {questionRows.length === 0 && (
                <div className="empty">暂无答题记录</div>
              )}
              {questionRows.map((q: QuestionStat) => (
                <div className="bar-row" key={q.question_id}>
                  <div className="bar-head">
                    <span>{QUESTION_LABELS[q.question_id] ?? q.question_id}</span>
                    <span className="muted">
                      {pct(q.accuracy)} · {q.learners} 人 · 平均{" "}
                      {q.avg_duration_ms
                        ? `${Math.round(q.avg_duration_ms / 1000)}′`
                        : "—"}
                    </span>
                  </div>
                  <div className="bar-track">
                    <div
                      className={`bar-fill ${(q.accuracy ?? 0) < 50 ? "warm" : ""}`}
                      style={{ width: `${Math.min(100, q.accuracy ?? 0)}%` }}
                    />
                  </div>
                </div>
              ))}

              <div className="card-head" style={{ marginTop: 26 }}>
                <h2>常见错误答案</h2>
                <span className="muted">出现次数最多的错答</span>
              </div>
              {wrongRows.length === 0 && <div className="empty">暂无错答记录</div>}
              {wrongRows.map((w, i) => (
                <div className="list-row" key={`${w.question_id}-${i}`}>
                  <span>
                    <span className="code">{w.question_id}</span>{" "}
                    {readableAnswer(w.answer_text).slice(0, 70)}
                  </span>
                  <span className="muted">
                    {w.times} 次 / {w.learners} 人
                  </span>
                </div>
              ))}
            </section>

            <div style={{ display: "grid", gap: 18 }}>
              <section className="card">
                <div className="card-head">
                  <h2>每日参与</h2>
                  <span className="muted">最近 {daily.length} 天</span>
                </div>
                {daily.map((d) => (
                  <div className="bar-row" key={d.day}>
                    <div className="bar-head">
                      <span>{d.day}</span>
                      <span className="muted">
                        {d.sessions} 次 · 完成 {d.completed}
                      </span>
                    </div>
                    <div className="bar-track">
                      <div
                        className="bar-fill"
                        style={{ width: `${(d.sessions / maxDaily) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </section>

              <section className="card">
                <div className="card-head">
                  <h2>行为事件分布</h2>
                  <span className="muted">操作次数</span>
                </div>
                {events.map((e) => (
                  <div className="list-row" key={e.event_type}>
                    <span>{EVENT_LABELS[e.event_type] ?? e.event_type}</span>
                    <span className="muted">
                      {e.events} 次 · {e.sessions} 人次
                    </span>
                  </div>
                ))}
              </section>
            </div>
          </div>

          <p className="foot">
            数据源：CloudBase PostgreSQL · 表 <span className="code">moonlab_sessions</span>{" "}
            / <span className="code">moonlab_events</span> /{" "}
            <span className="code">moonlab_answers</span> · 看板只读取聚合视图
          </p>
        </>
      )}
    </main>
  );
}
