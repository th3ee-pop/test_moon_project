"use client";

/**
 * 轻量埋点客户端：本地排队 + 定时批量上报 + 离开页面时用 sendBeacon 兜底。
 * 不阻塞交互；上报失败只记日志，不影响学生使用。
 */

export type PendingEvent = {
  id: string;
  seq: number;
  type: string;
  phase?: string | null;
  payload?: Record<string, unknown>;
  ts: string;
};

export type PendingAnswer = {
  id: string;
  questionId: string;
  questionType: string;
  prompt?: string | null;
  answer?: unknown;
  correctAnswer?: unknown;
  isCorrect: boolean;
  attempt: number;
  durationMs?: number | null;
  ts: string;
};

type FinishPayload = {
  endedAt: string;
  durationMs: number;
  score: number;
  total: number;
  completed: boolean;
};

const uuid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export class Tracker {
  readonly sessionId: string;
  private seq = 0;
  private events: PendingEvent[] = [];
  private answers: PendingAnswer[] = [];
  private startedAt = new Date().toISOString();
  private finish: FinishPayload | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private flushing = false;
  private sentAny = false;

  constructor(
    private studentName: string,
    private className: string | null,
  ) {
    this.sessionId = uuid();
  }

  start() {
    this.track("session_start", { studentName: this.studentName });
    this.timer = setInterval(() => void this.flush(true), 5000);
    if (typeof window !== "undefined") {
      window.addEventListener("pagehide", this.onLeave);
      document.addEventListener("visibilitychange", this.onVisibility);
    }
    void this.flush();
  }

  private onVisibility = () => {
    if (document.visibilityState === "hidden") void this.flush(true);
  };

  private onLeave = () => {
    if (!this.events.length && !this.answers.length && !this.finish) return;
    const body = JSON.stringify(this.payload());
    if (navigator.sendBeacon) {
      navigator.sendBeacon(
        "/api/track",
        new Blob([body], { type: "application/json" }),
      );
    }
  };

  track(type: string, payload: Record<string, unknown> = {}, phase?: string) {
    this.events.push({
      id: uuid(),
      seq: ++this.seq,
      type,
      payload,
      phase: phase ?? null,
      ts: new Date().toISOString(),
    });
    if (type !== "session_start") void this.flush();
  }

  recordAnswer(a: Omit<PendingAnswer, "id" | "ts">) {
    this.answers.push({ ...a, id: uuid(), ts: new Date().toISOString() });
    void this.flush();
  }

  complete(f: FinishPayload) {
    this.finish = f;
  }

  private payload() {
    return {
      session: {
        id: this.sessionId,
        studentName: this.studentName,
        className: this.className,
        startedAt: this.startedAt,
        userAgent:
          typeof navigator !== "undefined" ? navigator.userAgent : null,
      },
      events: this.events,
      answers: this.answers,
      finish: this.finish,
    };
  }

  async flush(force = false) {
    if (this.flushing) return;
    if (!this.events.length && !this.answers.length && !this.finish && this.sentAny) {
      return;
    }
    if (!this.events.length && !this.answers.length && !this.finish) return;
    if (!force && this.events.length < 3 && this.answers.length < 2 && !this.finish) {
      return;
    }

    const body = JSON.stringify(this.payload());
    this.events = [];
    this.answers = [];
    this.finish = null;
    this.sentAny = true;
    this.flushing = true;
    try {
      await fetch("/api/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      });
    } catch (err) {
      console.warn("[tracker] flush failed", err);
    } finally {
      this.flushing = false;
    }
  }

  destroy() {
    if (this.timer) clearInterval(this.timer);
    if (typeof window !== "undefined") {
      window.removeEventListener("pagehide", this.onLeave);
      document.removeEventListener("visibilitychange", this.onVisibility);
    }
    void this.flush(true);
  }
}
