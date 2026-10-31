"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import MoonScene from "@/components/MoonScene";
import MoonStage from "@/components/MoonStage";
import {
  OBSERVE_DAYS,
  OBSERVE_START,
  QUESTIONS,
  TOTAL_SCORED,
  correctAnswerOf,
  gradeQuestion,
  type Question,
} from "@/lib/questions";
import {
  addDays,
  formatCN,
  getMoon,
  parseISODate,
  toISODate,
} from "@/lib/moon";
import { Tracker } from "@/lib/tracker";

type Mode = "intro" | "task" | "done";

type AnswerState = {
  answer: unknown;
  isCorrect: boolean;
  attempts: number;
  durationMs: number;
  submitted: boolean;
};

const START_DATE = parseISODate(OBSERVE_START);

export default function Page() {
  const [mode, setMode] = useState<Mode>("intro");
  const [name, setName] = useState("");
  const [className, setClassName] = useState("");
  const [dateIdx, setDateIdx] = useState(19); // 默认停在 4 月初，避免直接落在题目考察的那天
  const [reveal, setReveal] = useState(false);
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerState>>({});
  const [draftChoice, setDraftChoice] = useState<number | null>(null);
  const [draftMulti, setDraftMulti] = useState<number[]>([]);
  const [draftOrder, setDraftOrder] = useState<string[]>([]);
  const [draftOpen, setDraftOpen] = useState("");
  const [feedback, setFeedback] = useState<boolean | null>(null);
  const [score, setScore] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  const tracker = useRef<Tracker | null>(null);
  const qStart = useRef<number>(Date.now());
  const sessionStart = useRef<number>(Date.now());
  const lastLoggedDate = useRef<string>("");
  const dateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentDate = useMemo(() => addDays(START_DATE, dateIdx), [dateIdx]);
  const moon = useMemo(() => getMoon(currentDate), [currentDate]);
  const question = QUESTIONS[step];
  const isLast = step === QUESTIONS.length - 1;

  useEffect(() => {
    if (mode !== "task") return;
    const t = setInterval(
      () => setElapsed(Math.floor((Date.now() - sessionStart.current) / 1000)),
      1000,
    );
    return () => clearInterval(t);
  }, [mode]);

  useEffect(() => {
    if (mode !== "task" || !question) return;
    qStart.current = Date.now();
    tracker.current?.track(
      "question_view",
      { index: step + 1, total: QUESTIONS.length },
      question.id,
    );
  }, [mode, step, question]);

  useEffect(() => {
    return () => {
      tracker.current?.destroy();
    };
  }, []);

  const start = () => {
    const t = new Tracker(name.trim() || "匿名同学", className.trim() || null);
    tracker.current = t;
    t.start();
    sessionStart.current = Date.now();
    setMode("task");
    setStep(0);
    setAnswers({});
    setScore(0);
    setElapsed(0);
  };

  const onDateChange = (value: number) => {
    setDateIdx(value);
    const d = addDays(START_DATE, value);
    const iso = toISODate(d);
    if (dateTimer.current) clearTimeout(dateTimer.current);
    dateTimer.current = setTimeout(() => {
      if (lastLoggedDate.current === iso) return;
      lastLoggedDate.current = iso;
      const m = getMoon(d);
      tracker.current?.track(
        "moon_date_change",
        {
          date: iso,
          dayIndex: value,
          age: m.age,
          phaseKey: m.key,
          illumination: Number(m.illumination.toFixed(3)),
        },
        m.key,
      );
    }, 500);
  };

  const toggleReveal = () => {
    const next = !reveal;
    setReveal(next);
    if (next) {
      tracker.current?.track(
        "phase_name_reveal",
        { date: toISODate(currentDate), answer: moon.name },
        moon.key,
      );
    }
  };

  const submit = () => {
    if (!question || question.type === "open") return;
    const q = question;
    const raw =
      q.type === "choice"
        ? draftChoice
        : q.type === "multi"
          ? draftMulti
          : draftOrder;
    if (
      raw === null ||
      (Array.isArray(raw) && raw.length === 0) ||
      (q.type === "order" && draftOrder.length !== q.correctOrder.length)
    ) {
      return;
    }

    const { isCorrect } = gradeQuestion(q, raw);
    const durationMs = Date.now() - qStart.current;
    const attempts = (answers[q.id]?.attempts ?? 0) + 1;

    setAnswers((prev) => ({
      ...prev,
      [q.id]: { answer: raw, isCorrect, attempts, durationMs, submitted: true },
    }));
    setFeedback(isCorrect);
    if (isCorrect) setScore((s) => s + 1);

    tracker.current?.recordAnswer({
      questionId: q.id,
      questionType: q.type,
      prompt: q.title,
      answer: raw,
      correctAnswer: correctAnswerOf(q),
      isCorrect,
      attempt: attempts,
      durationMs,
    });
    tracker.current?.track(
      isCorrect ? "answer_correct" : "answer_wrong",
      { questionId: q.id, attempt: attempts, durationMs, answer: raw },
      q.id,
    );
  };

  const retry = () => {
    const q = question;
    if (!q) return;
    setFeedback(null);
    setAnswers((prev) => {
      const cur = prev[q.id];
      if (!cur) return prev;
      return { ...prev, [q.id]: { ...cur, submitted: false } };
    });
    tracker.current?.track("answer_retry", { questionId: q.id }, q.id);
    setDraftChoice(null);
    setDraftMulti([]);
    setDraftOrder([]);
  };

  const submitOpen = () => {
    const q = question;
    if (!q) return;
    const durationMs = Date.now() - qStart.current;
    tracker.current?.recordAnswer({
      questionId: q.id,
      questionType: "open",
      prompt: q.title,
      answer: draftOpen.slice(0, 500),
      correctAnswer: null,
      isCorrect: false,
      attempt: 1,
      durationMs,
    });
    tracker.current?.track(
      "open_submit",
      { questionId: q.id, length: draftOpen.length },
      q.id,
    );
    setAnswers((prev) => ({
      ...prev,
      [q.id]: {
        answer: draftOpen,
        isCorrect: false,
        attempts: 1,
        durationMs,
        submitted: true,
      },
    }));
    finish();
  };

  const next = () => {
    setFeedback(null);
    setDraftChoice(null);
    setDraftMulti([]);
    setDraftOrder([]);
    if (isLast) {
      finish();
      return;
    }
    setStep((s) => s + 1);
  };

  const finish = () => {
    const durationMs = Date.now() - sessionStart.current;
    setElapsed(Math.floor(durationMs / 1000));
    if (tracker.current) {
      tracker.current.complete({
        endedAt: new Date().toISOString(),
        durationMs,
        score,
        total: TOTAL_SCORED,
        completed: true,
      });
      tracker.current.track("session_complete", {
        score,
        total: TOTAL_SCORED,
        durationMs,
      });
      void tracker.current.flush(true);
    }
    setMode("done");
  };

  const restart = () => {
    tracker.current?.destroy();
    tracker.current = null;
    setMode("intro");
    setStep(0);
    setAnswers({});
    setScore(0);
    setReveal(false);
    setDraftChoice(null);
    setDraftMulti([]);
    setDraftOrder([]);
    setDraftOpen("");
    setFeedback(null);
    setElapsed(0);
  };

  const submittedNow =
    question && question.type !== "open"
      ? Boolean(answers[question.id]?.submitted)
      : false;

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">小学科学 · 地球与宇宙</p>
          <h1>
            月相观察实验室 <span className="tag">观察 · 提问 · 记录</span>
          </h1>
        </div>
        <div className="topbar-right">
          {mode === "task" && (
            <span className="timer">
              用时 {Math.floor(elapsed / 60)}:
              {String(elapsed % 60).padStart(2, "0")}
            </span>
          )}
          <Link className="ghost-btn" href="/dashboard">
            教师看板
          </Link>
        </div>
      </header>

      {mode === "intro" && (
        <section className="card intro">
          <div className="intro-moon">
            <MoonScene
              moon={getMoon(parseISODate("2026-04-01"))}
              showName
              size={230}
            />
          </div>
          <div className="intro-body">
            <h2>今晚的月亮，是什么样子？</h2>
            <p>
              月球自己不发光，我们看到的是它被太阳照亮的部分。随着月球绕地球公转，
              我们看到的亮面形状一直在变化——这就是月相。
            </p>
            <ul className="goal-list">
              <li>拖动日期条，观察 30 天里月相怎么一步步变化</li>
              <li>记录你的发现，完成 5 道探究题</li>
              <li>答题过程会被记录，供老师回看你的思考路径</li>
            </ul>
            <div className="fields">
              <label>
                <span>你的名字</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如：李小明"
                  maxLength={20}
                />
              </label>
              <label>
                <span>班级（可不填）</span>
                <input
                  value={className}
                  onChange={(e) => setClassName(e.target.value)}
                  placeholder="例如：五年级二班"
                  maxLength={20}
                />
              </label>
            </div>
            <button className="primary-btn" onClick={start}>
              开始观察 →
            </button>
          </div>
        </section>
      )}

      {mode === "task" && question && (
        <section className="workspace">
          <div className="card observatory">
            <div className="card-head">
              <h2>观察台</h2>
              <span className="muted">拖动日期，看看月亮</span>
            </div>

            <MoonStage moon={moon} showName={reveal} size={290} />

            <div className="date-readout">
              <strong>{formatCN(currentDate)}</strong>
              <span className="muted">2026 年</span>
            </div>

            <input
              className="slider"
              type="range"
              min={0}
              max={OBSERVE_DAYS - 1}
              value={dateIdx}
              onChange={(e) => onDateChange(Number(e.target.value))}
              aria-label="观测日期"
            />
            <div className="scale">
              <span>{formatCN(START_DATE)}</span>
              <span>{formatCN(addDays(START_DATE, OBSERVE_DAYS - 1))}</span>
            </div>

            <button className="reveal-btn" onClick={toggleReveal}>
              {reveal ? "隐藏月相名称" : "揭晓这天的月相名称"}
            </button>

            {reveal && (
              <p className="reveal-note">
                月龄约 <strong>{moon.age}</strong> 天，被照亮约{" "}
                <strong>{Math.round(moon.illumination * 100)}%</strong>
              </p>
            )}
          </div>

          <div className="card task">
            <div className="card-head">
              <h2>
                任务 {Math.min(step + 1, QUESTIONS.length)} / {QUESTIONS.length}
              </h2>
              <span className="muted">
                已答对 {score} / {TOTAL_SCORED}
              </span>
            </div>

            <div className="progress">
              <div
                className="progress-fill"
                style={{
                  width: `${((step + (submittedNow ? 1 : 0)) / QUESTIONS.length) * 100}%`,
                }}
              />
            </div>

            <h3 className="q-title">{question.title}</h3>

            <details
              className="hint"
              onToggle={(e) => {
                if ((e.target as HTMLDetailsElement).open) {
                  tracker.current?.track(
                    "hint_open",
                    { questionId: question.id },
                    question.id,
                  );
                }
              }}
            >
              <summary>需要一点提示？</summary>
              <p>{question.hint}</p>
            </details>

            {question.type === "choice" && (
              <div className="options">
                {question.options.map((opt, i) => (
                  <button
                    key={opt}
                    className={`option ${draftChoice === i ? "selected" : ""} ${
                      submittedNow && i === question.correctIndex ? "right" : ""
                    } ${
                      submittedNow &&
                      draftChoice === i &&
                      i !== question.correctIndex
                        ? "wrong"
                        : ""
                    }`}
                    disabled={submittedNow}
                    onClick={() => {
                      setDraftChoice(i);
                      tracker.current?.track(
                        "option_select",
                        { questionId: question.id, index: i, label: opt },
                        question.id,
                      );
                    }}
                  >
                    <span className="option-key">{"ABCDE"[i]}</span>
                    {opt}
                  </button>
                ))}
              </div>
            )}

            {question.type === "multi" && (
              <div className="options">
                {question.options.map((opt, i) => (
                  <button
                    key={opt}
                    className={`option ${draftMulti.includes(i) ? "selected" : ""} ${
                      submittedNow && question.correctIndexes.includes(i)
                        ? "right"
                        : ""
                    } ${
                      submittedNow &&
                      draftMulti.includes(i) &&
                      !question.correctIndexes.includes(i)
                        ? "wrong"
                        : ""
                    }`}
                    disabled={submittedNow}
                    onClick={() => {
                      setDraftMulti((prev) =>
                        prev.includes(i)
                          ? prev.filter((x) => x !== i)
                          : [...prev, i],
                      );
                      tracker.current?.track(
                        "option_toggle",
                        { questionId: question.id, index: i },
                        question.id,
                      );
                    }}
                  >
                    <span className="option-key">
                      {draftMulti.includes(i) ? "✓" : "○"}
                    </span>
                    {opt}
                  </button>
                ))}
              </div>
            )}

            {question.type === "order" && (
              <div className="order-wrap">
                <div className="slots">
                  {question.correctOrder.map((_, i) => (
                    <div key={i} className="slot">
                      <span className="slot-no">{i + 1}</span>
                      {draftOrder[i] ?? <span className="slot-empty">待放入</span>}
                    </div>
                  ))}
                </div>
                <div className="order-pool">
                  {question.items
                    .filter((it) => !draftOrder.includes(it))
                    .map((it) => (
                      <button
                        key={it}
                        className="chip"
                        disabled={submittedNow}
                        onClick={() => {
                          setDraftOrder((prev) => [...prev, it]);
                          tracker.current?.track(
                            "order_pick",
                            {
                              questionId: question.id,
                              item: it,
                              position: draftOrder.length + 1,
                            },
                            question.id,
                          );
                        }}
                      >
                        {it}
                      </button>
                    ))}
                  {draftOrder.length > 0 && !submittedNow && (
                    <button
                      className="chip chip-reset"
                      onClick={() => {
                        setDraftOrder([]);
                        tracker.current?.track(
                          "order_reset",
                          { questionId: question.id },
                          question.id,
                        );
                      }}
                    >
                      重排
                    </button>
                  )}
                </div>
              </div>
            )}

            {question.type === "open" && (
              <textarea
                className="open-input"
                value={draftOpen}
                onChange={(e) => setDraftOpen(e.target.value)}
                placeholder="写下你的猜想和理由…"
                maxLength={500}
                rows={4}
              />
            )}

            {feedback !== null && (
              <div className={`feedback ${feedback ? "ok" : "no"}`}>
                {feedback
                  ? "答对了，继续观察下一步。"
                  : "这次没答对，可以再想一想，或者看看提示。"}
              </div>
            )}

            <div className="actions">
              {question.type === "open" ? (
                <button
                  className="primary-btn"
                  onClick={submitOpen}
                  disabled={draftOpen.trim().length < 2}
                >
                  提交并完成
                </button>
              ) : submittedNow ? (
                <>
                  {feedback === false && (
                    <button className="ghost-btn" onClick={retry}>
                      再想一次
                    </button>
                  )}
                  <button className="primary-btn" onClick={next}>
                    {isLast ? "完成探究" : "下一题 →"}
                  </button>
                </>
              ) : (
                <button
                  className="primary-btn"
                  onClick={submit}
                  disabled={
                    question.type === "choice"
                      ? draftChoice === null
                      : question.type === "multi"
                        ? draftMulti.length === 0
                        : draftOrder.length !== question.correctOrder.length
                  }
                >
                  提交答案
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      {mode === "done" && (
        <section className="card done">
          <div className="done-moon">
            <MoonScene moon={getMoon(parseISODate("2026-04-01"))} size={190} />
          </div>
          <h2>{(name || "同学") + "，探究完成！"}</h2>
          <p className="done-score">
            <strong>{score}</strong>
            <span> / {TOTAL_SCORED} 题答对</span>
          </p>
          <p className="muted center-text">
            用时 {Math.floor(elapsed / 60)} 分 {elapsed % 60} 秒。你的操作和答案已经记录，
            老师可以在看板里看到大家的观察路径。
          </p>
          <div className="review">
            {QUESTIONS.filter((q) => q.type !== "open").map((q) => {
              const a = answers[q.id];
              return (
                <div key={q.id} className="review-row">
                  <span className={a?.isCorrect ? "dot ok" : "dot no"} />
                  <span className="review-title">{q.title}</span>
                  <span className="muted">
                    {a?.isCorrect ? "答对" : "已订正"}
                    {a?.attempts && a.attempts > 1 ? ` · 试了 ${a.attempts} 次` : ""}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="actions center">
            <button className="ghost-btn" onClick={restart}>
              再观察一次
            </button>
            <Link className="primary-btn" href="/dashboard">
              查看班级数据
            </Link>
          </div>
        </section>
      )}

      <footer className="foot">
        月相计算基于朔望月周期推算 · 行为数据写入 CloudBase PostgreSQL
        <br />
        月球 / 地球 / 银河贴图：Solar System Scope（CC BY 4.0）
      </footer>
    </main>
  );
}
