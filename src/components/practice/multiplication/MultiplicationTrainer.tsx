"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import {
  EXERCISES_COUNT,
  MAX_INPUT_LENGTH,
  MAX_POINTS,
  MAX_SECONDS,
  type Table,
} from "./constants";
import {
  formatTime,
  generateMultipliers,
  getFeedbackKey,
  getPoints,
  getTimerTone,
} from "./scoring";
import styles from "./MultiplicationTrainer.module.css";

type Phase = "idle" | "running" | "done";
type Tab = "exercises" | "instruction";

type Result = {
  a: number;
  b: number;
  user: number;
  correct: boolean;
  points: number;
};

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

const FEEDBACK_EMOJI = {
  excellent: "😀",
  good: "🙂",
  ok: "😐",
  tryAgain: "😟",
} as const;

export function MultiplicationTrainer({ table }: { table: Table }) {
  const t = useTranslations("PracticeMultiplication");
  const [tab, setTab] = useState<Tab>("exercises");
  const [phase, setPhase] = useState<Phase>("idle");
  const [multipliers, setMultipliers] = useState<number[]>([]);
  const [results, setResults] = useState<Result[]>([]);
  const [input, setInput] = useState("");

  const [sessionStart, setSessionStart] = useState(0);
  const [endTime, setEndTime] = useState(0);
  const [questionStart, setQuestionStart] = useState(0);
  const [now, setNow] = useState(0);

  const index = results.length;
  const current = multipliers[index];
  const answer = current !== undefined ? table * current : 0;

  const score = results.reduce((sum, result) => sum + result.points, 0);
  const lastResult = results[results.length - 1];
  const isLast = index === EXERCISES_COUNT - 1;

  const elapsed =
    phase === "running" ? Math.max(0, (now - questionStart) / 1000) : 0;
  const totalMs =
    phase === "idle"
      ? 0
      : phase === "done"
        ? endTime - sessionStart
        : Math.max(0, now - sessionStart);

  useEffect(() => {
    if (phase !== "running") return;
    const id = setInterval(() => setNow(Date.now()), 100);
    return () => clearInterval(id);
  }, [phase]);

  const start = () => {
    const time = Date.now();
    setMultipliers(generateMultipliers(EXERCISES_COUNT));
    setResults([]);
    setInput("");
    setSessionStart(time);
    setEndTime(0);
    setQuestionStart(time);
    setNow(time);
    setPhase("running");
  };

  const pressDigit = useCallback(
    (digit: string) => {
      if (phase !== "running" || tab !== "exercises") return;
      setInput((prev) => (prev.length < MAX_INPUT_LENGTH ? prev + digit : prev));
    },
    [phase, tab],
  );

  const backspace = useCallback(() => {
    if (phase !== "running" || tab !== "exercises") return;
    setInput((prev) => prev.slice(0, -1));
  }, [phase, tab]);

  const submit = useCallback(() => {
    if (phase !== "running" || tab !== "exercises" || input === "") return;
    if (current === undefined) return;

    const time = Date.now();
    const seconds = (time - questionStart) / 1000;
    const user = Number(input);
    const correct = user === answer;

    const newResults: Result[] = [
      ...results,
      {
        a: table,
        b: current,
        user,
        correct,
        points: correct ? getPoints(seconds) : 0,
      },
    ];

    setResults(newResults);
    setInput("");

    if (newResults.length >= EXERCISES_COUNT) {
      setEndTime(time);
      setPhase("done");
    } else {
      setQuestionStart(time);
      setNow(time);
    }
  }, [phase, tab, input, questionStart, answer, results, table, current]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
          target.closest("a, [role='menuitem']"))
      ) {
        return;
      }

      if (/^\d$/.test(event.key)) {
        pressDigit(event.key);
      } else if (event.key === "Backspace") {
        backspace();
      } else if (
        event.key === "Enter" &&
        phase === "running" &&
        tab === "exercises"
      ) {
        event.preventDefault();
        submit();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pressDigit, backspace, submit, phase, tab]);

  const shownExercise =
    phase === "idle" ? 0 : Math.min(results.length + 1, EXERCISES_COUNT);
  const taskNumber = Math.max(shownExercise, 1);
  const feedbackKey = getFeedbackKey(score);
  const barWidth =
    phase === "running" ? Math.min(elapsed / MAX_SECONDS, 1) * 100 : 0;
  const barTone = phase === "running" ? getTimerTone(elapsed) : "green";

  const rich = {
    btn: (chunks: React.ReactNode) => (
      <span className={styles.fakeBtn}>{chunks}</span>
    ),
    b: (chunks: React.ReactNode) => <b>{chunks}</b>,
  };

  return (
    <div className={styles.root}>
      <div className={styles.topBar}>
        <div className={styles.pills}>
          <span className={styles.pill}>
            {t("time", { time: formatTime(totalMs) })}
          </span>
          <span className={styles.pill}>
            {t("taskCounter", { current: taskNumber, total: EXERCISES_COUNT })}
          </span>
        </div>
      </div>

      <nav className={styles.tabs} aria-label={t("tabsLabel")}>
        <button
          type="button"
          className={styles.tab}
          aria-pressed={tab === "exercises"}
          onClick={() => setTab("exercises")}
        >
          {t("tabExercises")}
        </button>
        <button
          type="button"
          className={styles.tab}
          aria-pressed={tab === "instruction"}
          onClick={() => setTab("instruction")}
        >
          {t("tabInstruction")}
        </button>
      </nav>

      {tab === "instruction" ? (
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <div className={styles.cardTitle}>
              <span className={styles.dots} aria-hidden>
                <i />
                <i />
              </span>
              {t("instruction.title", { n: table })}
            </div>
            <span className={styles.tag}>{t("instruction.tag")}</span>
          </div>

          <ol className={styles.instruction}>
            <li>{t("instruction.step1", { count: EXERCISES_COUNT })}</li>
            <li>{t.rich("instruction.step2", rich)}</li>
            <li>
              {t("instruction.step3")}
              <div className={`${styles.keypad} ${styles.demoKeypad}`} aria-hidden>
                {KEYS.map((key) => (
                  <button key={key} type="button" tabIndex={-1}>
                    {key}
                  </button>
                ))}
                <button type="button" tabIndex={-1}>
                  0
                </button>
                <button type="button" tabIndex={-1} className={styles.span2}>
                  ⌫
                </button>
              </div>
              {t("instruction.step3b")}
            </li>
            <li>
              {t.rich("instruction.step4", rich)}
              <p className={styles.warning}>
                {t.rich("instruction.warning", rich)}
              </p>
            </li>
            <li>{t("instruction.step5")}</li>
            <li>
              {t("instruction.step6")}
              <ul>
                <li>
                  {t("instruction.points10")}{" "}
                  <span className={styles.dot} data-tone="green" aria-hidden />
                </li>
                <li>
                  {t("instruction.points9")}{" "}
                  <span className={styles.dot} data-tone="yellow" aria-hidden />
                </li>
                <li>
                  {t("instruction.points8")}{" "}
                  <span className={styles.dot} data-tone="orange" aria-hidden />
                </li>
                <li>
                  {t("instruction.points7")}{" "}
                  <span className={styles.dot} data-tone="red" aria-hidden />
                </li>
              </ul>
            </li>
            <li>{t("instruction.step7", { count: EXERCISES_COUNT })}</li>
            <li>{t.rich("instruction.step8", rich)}</li>
          </ol>
        </section>
      ) : (
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <div className={styles.cardTitle}>
              <span className={styles.dots} aria-hidden>
                <i />
                <i />
              </span>
              {t("taskNumber", { n: taskNumber })}
            </div>
            <span className={styles.tag}>{t("tableTag", { n: table })}</span>
          </div>

          {phase === "idle" ? (
            <p className={styles.hint}>{t("intro", { n: table })}</p>
          ) : null}

          <div className={styles.question}>
            <span className={styles.qLabel}>{t("calculate")}</span>
            {phase === "done" ? (
              <span className={styles.eq}>{t("done")}</span>
            ) : (
              <>
                <span className={styles.eq}>
                  {table} · {phase === "idle" ? table : current} =
                </span>
                <span
                  className={styles.answerBox}
                  data-active={phase === "running"}
                >
                  {phase === "idle" ? "?" : input || "\u00A0"}
                </span>
              </>
            )}
          </div>

          <div className={styles.controls}>
            <div className={styles.stats}>
              <div className={styles.progress}>
                <div
                  className={styles.progressBar}
                  data-tone={barTone}
                  style={{ width: `${barWidth || 1}%` }}
                />
              </div>
              <p>
                {t("exercisesProgress", {
                  current: shownExercise,
                  total: phase === "idle" ? 0 : EXERCISES_COUNT,
                })}
              </p>
              <p>{t("scoreNow", { score })}</p>
              {lastResult ? (
                <p
                  className={lastResult.correct ? styles.good : styles.bad}
                  role="status"
                >
                  {t(lastResult.correct ? "lastCorrect" : "lastWrong", {
                    a: lastResult.a,
                    b: lastResult.b,
                    answer: lastResult.a * lastResult.b,
                  })}
                </p>
              ) : null}
            </div>

            <div className={styles.keypad}>
              {KEYS.map((key) => (
                <button key={key} type="button" onClick={() => pressDigit(key)}>
                  {key}
                </button>
              ))}
              <button type="button" onClick={() => pressDigit("0")}>
                0
              </button>
              <button
                type="button"
                className={styles.span2}
                onClick={backspace}
                aria-label={t("backspace")}
              >
                ⌫
              </button>
            </div>
          </div>

          {phase === "running" ? (
            <div className={styles.submitRow}>
              <button
                type="button"
                className={styles.primary}
                onClick={submit}
                disabled={input === ""}
              >
                {isLast ? t("finish") : t("next")}
              </button>
            </div>
          ) : null}

          {phase === "done" ? (
            <div className={styles.summary}>
              <p className={styles.scoreLine}>
                <b>
                  {t("finalScore", {
                    score,
                    max: EXERCISES_COUNT * MAX_POINTS,
                  })}
                </b>
              </p>
              <p>{t(`feedback.${feedbackKey}`)}</p>
              <div className={styles.emoji} aria-hidden>
                {FEEDBACK_EMOJI[feedbackKey]}
              </div>

              <ol className={styles.answers}>
                {results.map((result, i) => (
                  <li
                    key={i}
                    className={result.correct ? styles.ok : styles.wrong}
                  >
                    <span className={styles.answerStatus}>
                      {result.correct
                        ? t("answerCorrect", { n: i + 1, points: result.points })
                        : t("answerWrong", { n: i + 1 })}
                    </span>
                    <span>
                      {result.correct
                        ? t("answerLine", {
                            a: result.a,
                            b: result.b,
                            user: result.user,
                          })
                        : t("answerLineWrong", {
                            a: result.a,
                            b: result.b,
                            user: result.user,
                            correct: result.a * result.b,
                          })}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          ) : null}
        </section>
      )}

      <div className={styles.actions}>
        {tab === "exercises" && phase !== "running" ? (
          <button type="button" className={styles.primary} onClick={start}>
            {phase === "done" ? t("retry") : t("start")}
          </button>
        ) : null}
        <Link href="/practice/multiplication" className={styles.secondary}>
          {t("backToTables")}
        </Link>
      </div>
    </div>
  );
}
