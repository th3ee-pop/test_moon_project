import { NextResponse } from "next/server";
import {
  AnswerRow,
  EventRow,
  SessionRow,
  dbEnabled,
  insertAnswers,
  insertEvents,
  upsertSession,
} from "@/lib/db";

export const dynamic = "force-dynamic";

type TrackBody = {
  session?: {
    id?: string;
    studentName?: string;
    className?: string | null;
    startedAt?: string;
    userAgent?: string | null;
  };
  events?: {
    id: string;
    seq?: number;
    type: string;
    phase?: string | null;
    payload?: Record<string, unknown>;
    ts?: string;
  }[];
  answers?: {
    id: string;
    questionId: string;
    questionType?: string;
    prompt?: string | null;
    answer?: unknown;
    correctAnswer?: unknown;
    isCorrect: boolean;
    attempt?: number;
    durationMs?: number | null;
    ts?: string;
  }[];
  finish?: {
    endedAt?: string;
    durationMs?: number | null;
    score?: number;
    total?: number;
    completed?: boolean;
  };
};

const nowISO = () => new Date().toISOString();

export async function POST(req: Request) {
  if (!dbEnabled) {
    return NextResponse.json({ ok: false, reason: "db-not-configured" });
  }

  let body: TrackBody;
  try {
    body = (await req.json()) as TrackBody;
  } catch {
    return NextResponse.json({ ok: false, reason: "bad-json" }, { status: 400 });
  }

  const sid = body.session?.id;
  if (!sid) {
    return NextResponse.json({ ok: false, reason: "missing-session" }, { status: 400 });
  }

  const session: SessionRow = {
    id: sid,
    student_name: (body.session?.studentName || "匿名").slice(0, 40),
    class_name: body.session?.className?.slice(0, 40) ?? null,
    started_at: body.session?.startedAt ?? nowISO(),
    ended_at: body.finish?.endedAt ?? null,
    duration_ms: body.finish?.durationMs ?? null,
    score: body.finish?.score ?? 0,
    total_questions: body.finish?.total ?? 0,
    completed: body.finish?.completed ?? false,
    task_version: "moonlab-v1",
    user_agent: body.session?.userAgent?.slice(0, 300) ?? null,
  };

  const events: EventRow[] = (body.events ?? []).slice(0, 60).map((e, i) => ({
    id: e.id,
    session_id: sid,
    seq: e.seq ?? i,
    event_type: String(e.type).slice(0, 60),
    phase: e.phase?.slice(0, 60) ?? null,
    payload: e.payload ?? {},
    client_ts: e.ts ?? nowISO(),
  }));

  const answers: AnswerRow[] = (body.answers ?? []).slice(0, 40).map((a) => ({
    id: a.id,
    session_id: sid,
    question_id: a.questionId,
    question_type: a.questionType ?? "choice",
    prompt: a.prompt?.slice(0, 300) ?? null,
    answer: a.answer ?? null,
    correct_answer: a.correctAnswer ?? null,
    is_correct: Boolean(a.isCorrect),
    attempt: a.attempt ?? 1,
    duration_ms: a.durationMs ?? null,
  }));

  try {
    // 先落会话，保证外键存在；再批量写事件与答题
    const before = body.finish ? { ...session, completed: false, score: 0 } : session;
    await upsertSession(before);
    await insertEvents(events);
    await insertAnswers(answers);
    if (body.finish) await upsertSession(session);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[track] failed", err);
    return NextResponse.json(
      { ok: false, reason: err instanceof Error ? err.message : "unknown" },
      { status: 502 },
    );
  }
}
