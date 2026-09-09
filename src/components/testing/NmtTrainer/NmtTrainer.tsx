"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";

import {
  checkAnswerAction,
  finishTrainerSessionAction,
  getSessionMistakeReviewAction,
} from "@/modules/testing/actions";

import type {
  SessionTask,
  TrainerSessionSummary,
} from "@/modules/testing/types";
import type { SessionMistakeItem } from "@/modules/testing/getSessionMistakeReview";
import type { RecommendedAction } from "@/modules/recommendations";
import { TopicTrainerSummary } from "@/components/testing/TopicTrainerSummary";
import { MathText } from "@/components/ui/MathText";

import styles from "./NmtTrainer.module.css";

const NMT_DURATION_SEC = 60 * 60;
const MATCH_LETTERS = ["a", "b", "c", "d", "e"] as const;

type NmtTrainerProps = {
  sessionId: number;
  tasks: SessionTask[];
  initialSummary?: TrainerSessionSummary | null;
  initialRecommendations?: RecommendedAction[];
  initialMistakes?: SessionMistakeItem[];
};

function formatTime(seconds: number) {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function TaskBody({ text, className }: { text: string; className?: string }) {
  const parts = text.split(/!\[\]\(([^)]+)\)/g);
  return (
    <div className={className}>
      {parts.map((part, index) => {
        if (index % 2 === 1) {
          return (
            <span key={index} className={styles.taskImageWrap}>
              {/* External/local static under /nmt/osvita — sized fluidly */}
              <Image
                src={part}
                alt=""
                width={604}
                height={340}
                className={styles.taskImage}
                unoptimized
              />
            </span>
          );
        }
        if (!part.trim()) return null;
        return <MathText key={index} as="div" text={part} />;
      })}
    </div>
  );
}

export function NmtTrainer({
  sessionId,
  tasks,
  initialSummary,
  initialRecommendations = [],
  initialMistakes = [],
}: NmtTrainerProps) {
  const t = useTranslations("nmtTrainer");
  const locale = useLocale() as "uk" | "en" | "de";
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answered, setAnswered] = useState<Record<number, string>>({});
  const [remainingSeconds, setRemainingSeconds] = useState(NMT_DURATION_SEC);
  const [isFinishing, setIsFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openDraftByMapping, setOpenDraftByMapping] = useState<
    Record<number, string>
  >({});
  const [matchDraftByMapping, setMatchDraftByMapping] = useState<
    Record<number, [string, string, string]>
  >({});
  const [summary, setSummary] = useState<TrainerSessionSummary | null>(
    initialSummary ?? null,
  );
  const [recommendations, setRecommendations] = useState<RecommendedAction[]>(
    initialRecommendations,
  );
  const [mistakes, setMistakes] =
    useState<SessionMistakeItem[]>(initialMistakes);
  const [timedOut, setTimedOut] = useState(false);

  const answeringRef = useRef(false);
  const finishingRef = useRef(false);
  const [pendingMappingId, setPendingMappingId] = useState<number | null>(null);

  const currentTask = tasks[currentIndex];
  const answeredCount = Object.keys(answered).length;
  const kind = currentTask?.taskKind ?? "mcq";
  const openDraft = currentTask
    ? (openDraftByMapping[currentTask.mappingId] ?? "")
    : "";
  const matchDraft = currentTask
    ? (matchDraftByMapping[currentTask.mappingId] ?? ["", "", ""])
    : (["", "", ""] as [string, string, string]);

  const finish = useCallback(
    async (options: { timedOut?: boolean } = {}) => {
      if (isFinishing || summary || finishingRef.current) return;
      finishingRef.current = true;
      setIsFinishing(true);
      setError(null);
      if (options.timedOut) setTimedOut(true);

      const result = await finishTrainerSessionAction({
        sessionId,
        locale,
        markUnansweredAsIncorrect: true,
        capTimeSec: NMT_DURATION_SEC,
      });

      if (result.status === "error") {
        finishingRef.current = false;
        setError(result.code);
        setIsFinishing(false);
        return;
      }

      const review = await getSessionMistakeReviewAction(sessionId);
      setMistakes(review);
      setSummary(result.summary);
      setRecommendations(result.recommendations);
      setIsFinishing(false);
    },
    [isFinishing, summary, sessionId, locale],
  );

  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  }, [finish]);

  useEffect(() => {
    if (summary) return;
    let remaining = NMT_DURATION_SEC;
    const timer = window.setInterval(() => {
      remaining -= 1;
      setRemainingSeconds(remaining);
      if (remaining <= 0) {
        window.clearInterval(timer);
        void finishRef.current({ timedOut: true });
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [summary]);

  const isTimeOver = remainingSeconds <= 0;

  async function submitAnswer(payload: {
    answerNumber?: 1 | 2 | 3 | 4 | 5;
    answerText?: string;
    storeAs: string;
  }) {
    if (!currentTask || isFinishing || isTimeOver || answeringRef.current) {
      return;
    }
    if (answered[currentTask.mappingId]) return;

    answeringRef.current = true;
    setError(null);
    setPendingMappingId(currentTask.mappingId);

    let result: Awaited<ReturnType<typeof checkAnswerAction>>;
    try {
      result = await checkAnswerAction({
        sessionId,
        mappingId: currentTask.mappingId,
        answerNumber: payload.answerNumber,
        answerText: payload.answerText,
      });
    } finally {
      answeringRef.current = false;
      setPendingMappingId(null);
    }

    if (result.status === "error") {
      setError(result.code);
      return;
    }

    setAnswered((previous) => ({
      ...previous,
      [currentTask.mappingId]: payload.storeAs,
    }));
  }

  function goTo(index: number) {
    if (index < 0 || index >= tasks.length) return;
    setError(null);
    setCurrentIndex(index);
  }

  if (summary) {
    return (
      <TopicTrainerSummary
        summary={summary}
        recommendations={recommendations}
        mode="nmt"
        timedOut={timedOut}
        mistakes={mistakes}
      />
    );
  }

  if (!currentTask) return null;

  const selectedAnswer = answered[currentTask.mappingId];
  const pending = pendingMappingId === currentTask.mappingId;
  const locked = Boolean(selectedAnswer) || pending;

  return (
    <section className={styles.wrapper}>
      <header className={styles.header}>
        <div>
          <p className={styles.label}>{t("title")}</p>
          <h1>
            {t("taskProgress", {
              current: currentIndex + 1,
              total: tasks.length,
            })}
          </h1>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.timer} role="timer">
            {formatTime(remainingSeconds)}
          </div>
          <button
            type="button"
            className={styles.finishButton}
            onClick={() => void finish()}
            disabled={isFinishing}
          >
            {isFinishing ? t("finishing") : t("finishTest")}
          </button>
        </div>
      </header>

      <div className={styles.progress}>
        <div
          className={styles.progressBar}
          style={{ width: `${(answeredCount / tasks.length) * 100}%` }}
        />
      </div>

      <div className={styles.taskNav} aria-label={t("tasks")}>
        <p className={styles.counter}>
          {t("answered", { answered: answeredCount, total: tasks.length })}
        </p>
        <div className={styles.grid}>
          {tasks.map((task, index) => {
            const isAnswered = Boolean(answered[task.mappingId]);
            return (
              <button
                key={task.mappingId}
                type="button"
                className={`${styles.questionButton} ${
                  index === currentIndex ? styles.current : ""
                } ${isAnswered ? styles.answered : ""}`}
                onClick={() => goTo(index)}
                aria-current={index === currentIndex ? "step" : undefined}
              >
                {index + 1}
              </button>
            );
          })}
        </div>
      </div>

      <div className={styles.task}>
        <p className={styles.taskName}>{currentTask.name}</p>
        <TaskBody text={currentTask.taskText} className={styles.taskText} />

        {kind === "mcq" ? (
          <div className={styles.answers}>
            {currentTask.answers.map((answer) => {
              const letter =
                MATCH_LETTERS[answer.number - 1] ?? String(answer.number);
              const isSelected = selectedAnswer === String(answer.number);
              return (
                <button
                  key={answer.number}
                  type="button"
                  className={`${styles.answer} ${isSelected ? styles.selected : ""}`}
                  disabled={locked}
                  onClick={() =>
                    void submitAnswer({
                      answerNumber: answer.number,
                      storeAs: String(answer.number),
                    })
                  }
                >
                  <span className={styles.answerNumber}>
                    {letter.toUpperCase()}
                  </span>
                  <MathText text={answer.text} />
                </button>
              );
            })}
          </div>
        ) : null}

        {kind === "open" ? (
          <form
            className={styles.openForm}
            onSubmit={(event) => {
              event.preventDefault();
              if (!openDraft.trim()) return;
              void submitAnswer({
                answerText: openDraft.trim(),
                storeAs: openDraft.trim(),
              });
            }}
          >
            <label className={styles.openLabel} htmlFor="nmt-open-answer">
              {t("openLabel")}
            </label>
            <input
              id="nmt-open-answer"
              className={styles.openInput}
              value={selectedAnswer ?? openDraft}
              onChange={(event) => {
                if (!currentTask) return;
                const value = event.target.value;
                setOpenDraftByMapping((prev) => ({
                  ...prev,
                  [currentTask.mappingId]: value,
                }));
              }}
              disabled={locked}
              inputMode="decimal"
              autoComplete="off"
            />
            <button
              type="submit"
              className={styles.openSubmit}
              disabled={locked || !openDraft.trim()}
            >
              {t("submitAnswer")}
            </button>
          </form>
        ) : null}

        {kind === "match" ? (
          <form
            className={styles.matchForm}
            onSubmit={(event) => {
              event.preventDefault();
              if (matchDraft.some((v) => !v)) return;
              const answerText = `1${matchDraft[0]};2${matchDraft[1]};3${matchDraft[2]}`;
              void submitAnswer({ answerText, storeAs: answerText });
            }}
          >
            <p className={styles.openLabel}>{t("matchLabel")}</p>
            {[0, 1, 2].map((row) => (
              <label key={row} className={styles.matchRow}>
                <span>{row + 1}</span>
                <select
                  value={
                    selectedAnswer
                      ? (selectedAnswer.match(
                          new RegExp(`${row + 1}([a-e])`),
                        )?.[1] ?? "")
                      : matchDraft[row]
                  }
                  disabled={locked}
                  onChange={(event) => {
                    if (!currentTask) return;
                    const next = [...matchDraft] as [string, string, string];
                    next[row] = event.target.value;
                    setMatchDraftByMapping((prev) => ({
                      ...prev,
                      [currentTask.mappingId]: next,
                    }));
                  }}
                >
                  <option value="">{t("matchPick")}</option>
                  {MATCH_LETTERS.map((letter) => (
                    <option key={letter} value={letter}>
                      {letter.toUpperCase()}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <button
              type="submit"
              className={styles.openSubmit}
              disabled={locked || matchDraft.some((v) => !v)}
            >
              {t("submitAnswer")}
            </button>
          </form>
        ) : null}
      </div>

      <footer className={styles.footer}>
        <button
          type="button"
          onClick={() => goTo(currentIndex - 1)}
          disabled={currentIndex === 0}
        >
          ← {t("back")}
        </button>
        <button
          type="button"
          onClick={() => goTo(currentIndex + 1)}
          disabled={currentIndex === tasks.length - 1}
        >
          {t("next")} →
        </button>
      </footer>

      {error ? <p className={styles.error}>{t(`errors.${error}`)}</p> : null}
    </section>
  );
}
