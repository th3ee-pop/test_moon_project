/**
 * CloudBase PostgreSQL 数据访问层（仅服务端使用）。
 * 走 CloudBase 的 PostgREST 风格 HTTP 接口，API Key 只存在于服务端环境变量里。
 */

const ENV_ID = process.env.CB_ENV_ID ?? "";
const API_KEY = process.env.CB_API_KEY ?? "";
const BASE = ENV_ID ? `https://${ENV_ID}.api.tcloudbasegateway.com/v1/rdb/rest` : "";

// 两个变量缺一不可。这里刻意不留默认环境：漏配时宁可静默不写，
// 也好过悄悄把数据写进另一个环境。
export const dbEnabled = Boolean(API_KEY && ENV_ID);

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<T | null> {
  if (!API_KEY) return null;
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PG ${path} → ${res.status} ${text.slice(0, 300)}`);
  }
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (null as T);
}

export type SessionRow = {
  id: string;
  student_name: string;
  class_name: string | null;
  started_at: string;
  ended_at: string | null;
  duration_ms: number | null;
  score: number;
  total_questions: number;
  completed: boolean;
  task_version: string;
  user_agent: string | null;
};

export type EventRow = {
  id: string;
  session_id: string;
  seq: number;
  event_type: string;
  phase: string | null;
  payload: Record<string, unknown>;
  client_ts: string;
};

export type AnswerRow = {
  id: string;
  session_id: string;
  question_id: string;
  question_type: string;
  prompt: string | null;
  answer: unknown;
  correct_answer: unknown;
  is_correct: boolean;
  attempt: number;
  duration_ms: number | null;
};

export async function upsertSession(row: SessionRow) {
  return request("/moonlab_sessions?on_conflict=id", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(row),
  });
}

export async function insertEvents(rows: EventRow[]) {
  if (!rows.length) return null;
  return request("/moonlab_events", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(rows),
  });
}

export async function insertAnswers(rows: AnswerRow[]) {
  if (!rows.length) return null;
  return request("/moonlab_answers", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(rows),
  });
}

export type Overview = {
  sessions: number;
  completed_sessions: number;
  avg_duration_sec: number | null;
  avg_score: number | null;
  completion_rate: number;
  last_active_at: string | null;
};

export type QuestionStat = {
  question_id: string;
  question_type: string;
  prompt: string | null;
  attempts: number;
  learners: number;
  correct_count: number;
  accuracy: number;
  avg_duration_ms: number | null;
};

export type EventStat = { event_type: string; events: number; sessions: number };
export type DailyStat = {
  day: string;
  sessions: number;
  completed: number;
  avg_score: number | null;
  avg_duration_sec: number | null;
};
export type WrongPattern = {
  question_id: string;
  answer_text: string;
  times: number;
  learners: number;
};

export async function fetchStats() {
  const [overview, questions, events, daily, wrong] = await Promise.all([
    request<Overview[]>("/moonlab_overview?select=*"),
    request<QuestionStat[]>("/moonlab_question_stats?select=*&order=question_id.asc"),
    request<EventStat[]>("/moonlab_event_stats?select=*&order=events.desc"),
    request<DailyStat[]>("/moonlab_daily?select=*&order=day.desc&limit=14"),
    request<WrongPattern[]>("/moonlab_wrong_patterns?select=*&limit=8"),
  ]);
  return {
    overview: overview?.[0] ?? null,
    questions: questions ?? [],
    events: events ?? [],
    daily: (daily ?? []).slice().reverse(),
    wrong: wrong ?? [],
  };
}
