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
import { NmtMatchTask } from "@/components/testing/NmtMatchTask/NmtMatchTask";
import { TestTaskCard, optionLetter, taskKicker } from "@/components/testing/TestTaskCard";
import cardCss from "@/components/testing/TestTaskCard/TestTaskCard.module.css";

import styles from "./NmtTrainer.module.css";

const NMT_DURATION_SEC = 60 * 60;

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

const MATCH_CYRILLIC_TO_LATIN: Record<string, string> = {
  а: "a",
  б: "b",
  в: "c",
  г: "d",
  д: "e",
};

/** Stored keys are `1b;2d;3a`. A Cyrillic letter from an older client still fills the select. */
function matchLetterAt(answerText: string, row: number): string {
  const raw = answerText.match(new RegExp(`${row}([a-eабвгд])`, "i"))?.[1]?.toLowerCase() ?? "";
  return MATCH_CYRILLIC_TO_LATIN[raw] ?? raw;
}

function TaskBody({
  text,
  className,
  imageAlt,
}: {
  text: string;
  className?: string;
  imageAlt: string;
}) {
  const parts = text.split(/!\[\s*\]\s*\(([^)]+)\)/g);
  return (
    <div className={className}>
      {parts.map((part, index) => {
        if (index % 2 === 1) {
          return (
            <span key={index} className={styles.taskImageWrap}>
              {/* External/local static under /nmt/osvita — sized fluidly */}
              <Image
                src={part.trim()}
                alt={imageAlt}
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
  const [pasteBlocked, setPasteBlocked] = useState(false);
  const rejectExamPaste = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    setPasteBlocked(true);
  };

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
  const kicker = taskKicker(currentTask.name, currentTask.taskText);

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

      <TestTaskCard
        titleId="nmt-task-title"
        title={t("taskHeading", { number: currentIndex + 1 })}
        kicker={kicker ? <MathText text={kicker} /> : undefined}
        prompt={
          <TaskBody
            text={currentTask.taskText}
            imageAlt={t("taskImageAlt", { n: currentIndex + 1 })}
          />
        }
      >
        {kind === "mcq" ? (
          <div
            className={`${cardCss.answers} ${cardCss.answersStack}`}
            role="group"
            aria-label={t("tasks")}
          >
            {currentTask.answers.map((answer) => {
              const isSelected = selectedAnswer === String(answer.number);
              return (
                <button
                  key={answer.number}
                  type="button"
                  className={`${cardCss.option} ${isSelected ? cardCss.optionSelected : ""}`}
                  disabled={locked}
                  aria-pressed={isSelected}
                  onClick={() =>
                    void submitAnswer({
                      answerNumber: answer.number,
                      storeAs: String(answer.number),
                    })
                  }
                >
                  <span className={cardCss.mark}>
                    {optionLetter(answer.number - 1)})
                  </span>
                  <TaskBody
                    className={cardCss.optionText}
                    text={answer.text}
                    imageAlt={t("taskImageAlt", {
                      n: currentIndex + 1,
                    })}
                  />
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
                setPasteBlocked(false);
                const value = event.target.value;
                setOpenDraftByMapping((prev) => ({
                  ...prev,
                  [currentTask.mappingId]: value,
                }));
              }}
              onPaste={rejectExamPaste}
              onDrop={rejectExamPaste}
              onDragOver={(event) => event.preventDefault()}
              onBeforeInput={(event) => {
                const inputType = (event.nativeEvent as InputEvent).inputType;
                if (inputType === "insertFromPaste" || inputType === "insertFromDrop") {
                  rejectExamPaste(event);
                }
              }}
              disabled={locked}
              inputMode="decimal"
              autoComplete="off"
            />
            {pasteBlocked ? (
              <p className={styles.pasteHint} role="status">
                {t("pasteBlocked")}
              </p>
            ) : null}
            <button
              type="submit"
              className={styles.openSubmit}
              disabled={locked || !openDraft.trim()}
            >
              {t("submitAnswer")}
            </button>
          </form>
        ) : null}

        {kind === "match" && currentTask.match ? (
          <NmtMatchTask
            match={currentTask.match}
            imageAlt={t("taskImageAlt", { n: currentIndex + 1 })}
            instruction={t("matchLabel")}
            pickLabel={t("matchPick")}
            submitLabel={t("submitAnswer")}
            rowLabel={(row) => t("matchRowLabel", { n: row })}
            locked={locked}
            selected={matchDraft.map((letter, row) =>
              selectedAnswer ? matchLetterAt(selectedAnswer, row + 1) : letter,
            )}
            onSelect={(row, next) => {
              const nextDraft = [...matchDraft] as [string, string, string];
              nextDraft[row] = next;
              setMatchDraftByMapping((prev) => ({
                ...prev,
                [currentTask.mappingId]: nextDraft,
              }));
            }}
            onSubmit={() => {
              if (matchDraft.some((value) => !value)) return;
              const answerText = `1${matchDraft[0]};2${matchDraft[1]};3${matchDraft[2]}`;
              void submitAnswer({ answerText, storeAs: answerText });
            }}
          />
        ) : null}
      </TestTaskCard>

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
