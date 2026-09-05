"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import clsx from "clsx";
import {
  checkAnswerAction,
  finishTrainerSessionAction,
  getSessionMistakeReviewAction,
  skipTaskAnswerAction,
} from "@/modules/testing/actions";
import type { SessionMistakeItem } from "@/modules/testing/getSessionMistakeReview";
import { formatElapsedClock } from "@/modules/testing/sessionElapsed";
import {
  ULTIMATE_DURATION_SEC,
  ULTIMATE_TIMER_WARNING_SEC,
  type TopicTestMode,
} from "@/modules/testing/topicTestMode";
import {
  TASK_STATUS_CORRECT,
  TASK_STATUS_INCORRECT,
  type SessionTask,
  type SessionTaskAnswer,
  type TrainerSessionSummary,
} from "@/modules/testing/types";
import type { RecommendedAction } from "@/modules/recommendations";
import { TopicTrainerSummary } from "@/components/testing/TopicTrainerSummary";
import { MathText } from "@/components/ui/MathText";
import { useCountdownTimer } from "./useCountdownTimer";
import { useSessionTimer } from "./useSessionTimer";
import { useLocale, useTranslations } from "next-intl";
import css from "./TopicTrainer.module.css";

type TopicTrainerProps = {
  sessionId: number;
  themeCode: string;
  themeName: string;
  tasks: SessionTask[];
  initialSummary?: TrainerSessionSummary | null;
  initialRecommendations?: RecommendedAction[];
  mode?: TopicTestMode;
};

type CheckResult = { correct: boolean };

function initialResults(tasks: SessionTask[]): Record<number, CheckResult> {
  const results: Record<number, CheckResult> = {};
  for (const task of tasks) {
    if (task.status === TASK_STATUS_CORRECT)
      results[task.mappingId] = { correct: true };
    if (task.status === TASK_STATUS_INCORRECT)
      results[task.mappingId] = { correct: false };
  }
  return results;
}

export function TopicTrainer({
  sessionId,
  themeCode,
  themeName,
  tasks,
  initialSummary = null,
  initialRecommendations = [],
  mode = "standard",
}: TopicTrainerProps) {
  const isUltimate = mode === "ultimate";
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedByMappingId, setSelectedByMappingId] = useState<
    Record<number, SessionTaskAnswer["number"]>
  >({});
  const [resultsByMappingId, setResultsByMappingId] = useState(() =>
    initialResults(tasks),
  );
  const [pendingMappingId, setPendingMappingId] = useState<number | null>(null);
  const [isFinishing, setIsFinishing] = useState(false);
  const [summary, setSummary] = useState<TrainerSessionSummary | null>(
    initialSummary,
  );
  const [recommendations, setRecommendations] = useState<RecommendedAction[]>(
    initialRecommendations,
  );
  const [mistakes, setMistakes] = useState<SessionMistakeItem[]>([]);
  const [timedOut, setTimedOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const finishingRef = useRef(false);
  const t = useTranslations("TopicTrainer");
  const locale = useLocale() as "uk" | "en" | "de";

  const elapsedSec = useSessionTimer({
    sessionId,
    enabled: !isUltimate && summary == null,
  });

  const finishUltimate = useCallback(
    async (options: { timedOut?: boolean } = {}) => {
      if (finishingRef.current || summary) return;
      finishingRef.current = true;
      setIsFinishing(true);
      setErrorMessage(null);
      if (options.timedOut) setTimedOut(true);

      const result = await finishTrainerSessionAction({
        sessionId,
        locale,
        markUnansweredAsIncorrect: true,
        capTimeSec: options.timedOut ? ULTIMATE_DURATION_SEC : undefined,
      });
      setIsFinishing(false);

      if (result.status !== "success") {
        finishingRef.current = false;
        setErrorMessage(t(`errors.finish.${result.code}`));
        return;
      }

      const review = await getSessionMistakeReviewAction(sessionId);
      setMistakes(review);
      setSummary(result.summary);
      setRecommendations(result.recommendations);
    },
    [sessionId, summary, locale, t],
  );

  const handleTimeExpired = useCallback(() => {
    void finishUltimate({ timedOut: true });
  }, [finishUltimate]);

  const remainingSec = useCountdownTimer({
    sessionId,
    enabled: isUltimate && summary == null,
    durationSec: ULTIMATE_DURATION_SEC,
    onExpire: handleTimeExpired,
  });

  const currentTask = tasks[currentIndex];
  const total = tasks.length;
  const selectedAnswer = currentTask
    ? selectedByMappingId[currentTask.mappingId]
    : undefined;
  const checkResult = currentTask
    ? resultsByMappingId[currentTask.mappingId]
    : undefined;
  const isPending =
    currentTask != null && pendingMappingId === currentTask.mappingId;
  const isLast = currentIndex === total - 1;
  const allAnswered =
    tasks.length > 0 &&
    tasks.every((task) => resultsByMappingId[task.mappingId] !== undefined);

  if (summary) {
    return (
      <TopicTrainerSummary
        summary={summary}
        recommendations={recommendations}
        mode={mode}
        timedOut={timedOut}
        mistakes={mistakes}
      />
    );
  }

  if (!currentTask) {
    return null;
  }

  function advanceAfterAnswer(mappingId: number, correct: boolean) {
    setResultsByMappingId((prev) => ({
      ...prev,
      [mappingId]: { correct },
    }));

    if (isUltimate) {
      if (isLast) {
        void finishUltimate();
        return;
      }
      setCurrentIndex((index) => index + 1);
      setErrorMessage(null);
    }
  }

  async function handleSelect(answerNumber: SessionTaskAnswer["number"]) {
    if (checkResult || isPending || isFinishing) return;

    setSelectedByMappingId((prev) => ({
      ...prev,
      [currentTask.mappingId]: answerNumber,
    }));
    setErrorMessage(null);
    setPendingMappingId(currentTask.mappingId);

    const result = await checkAnswerAction({
      sessionId,
      mappingId: currentTask.mappingId,
      answerNumber,
    });

    setPendingMappingId(null);

    if (result.status !== "success") {
      setErrorMessage(t(`errors.checkAnswer.${result.code}`));
      return;
    }

    if (isUltimate) {
      advanceAfterAnswer(currentTask.mappingId, result.correct);
      return;
    }

    setResultsByMappingId((prev) => ({
      ...prev,
      [currentTask.mappingId]: { correct: result.correct },
    }));
  }

  async function handleSkip() {
    if (!isUltimate || checkResult || isPending || isFinishing) return;

    setErrorMessage(null);
    setPendingMappingId(currentTask.mappingId);

    const result = await skipTaskAnswerAction({
      sessionId,
      mappingId: currentTask.mappingId,
    });

    setPendingMappingId(null);

    if (result.status !== "success") {
      setErrorMessage(t(`errors.skip.${result.code}`));
      return;
    }

    advanceAfterAnswer(currentTask.mappingId, false);
  }

  function handleNext() {
    if (checkResult === undefined) return;
    if (!isLast) {
      setCurrentIndex((index) => index + 1);
      setErrorMessage(null);
    }
  }

  async function handleFinish() {
    if (!allAnswered || isFinishing || isPending) return;

    setErrorMessage(null);
    setIsFinishing(true);

    const result = await finishTrainerSessionAction({ sessionId, locale });
    setIsFinishing(false);

    if (result.status !== "success") {
      setErrorMessage(t(`errors.finish.${result.code}`));
      return;
    }

    setSummary(result.summary);
    setRecommendations(result.recommendations);
  }

  async function handleAbortUltimate() {
    if (!window.confirm(t("confirmAbortUltimate"))) {
      return;
    }
    await finishUltimate();
  }

  const timerLabel = isUltimate
    ? formatElapsedClock(remainingSec)
    : formatElapsedClock(elapsedSec);
  const timerWarning = isUltimate && remainingSec <= ULTIMATE_TIMER_WARNING_SEC;

  return (
    <section className={css.topicTrainer} aria-labelledby="topic-trainer-title">
      <header className={css.header}>
        <div>
          <h1 id="topic-trainer-title" className={css.title}>
            {isUltimate ? t("ultimateTitle") : t("title")}
          </h1>
          <p className={css.meta}>
            {t("session", { id: sessionId })}
            {" · "}
            <Link
              href={`/materials/textbook#topic-${themeCode}`}
              className={css.themeLink}
            >
              {themeName}
            </Link>
          </p>
        </div>
        <div className={css.badges}>
          {isUltimate ? (
            <p className={clsx(css.modeBadge, css.modeUltimate)}>Ultimate</p>
          ) : null}
          <p
            className={clsx(css.progress, timerWarning && css.progressWarning)}
            role="timer"
            aria-label={
              isUltimate
                ? t("remainingAria", { time: timerLabel })
                : t("timeAria", { time: timerLabel })
            }
          >
            {isUltimate ? t("remaining") : t("time")}: {timerLabel}
          </p>
          <p className={css.progress} aria-live="polite">
            {t("taskProgress", { current: currentIndex + 1, total })}
          </p>
        </div>
      </header>

      <article
        className={css.card}
        aria-label={t("taskAria", { number: currentIndex + 1 })}
      >
        <h2 className={css.taskName}>{currentTask.name}</h2>
        <MathText
          as="div"
          className={css.taskText}
          text={currentTask.taskText}
        />

        <div
          className={css.answers}
          role="group"
          aria-label={t("answerOptions")}
        >
          {currentTask.answers.map((answer) => (
            <button
              key={answer.number}
              type="button"
              className={clsx(
                css.answer,
                selectedAnswer === answer.number &&
                  (isUltimate ? checkResult === undefined : true) &&
                  css.answerSelected,
                !isUltimate &&
                  selectedAnswer === answer.number &&
                  checkResult?.correct === true &&
                  css.answerCorrect,
                !isUltimate &&
                  selectedAnswer === answer.number &&
                  checkResult?.correct === false &&
                  css.answerWrong,
              )}
              onClick={() => handleSelect(answer.number)}
              disabled={isPending || checkResult !== undefined || isFinishing}
              aria-pressed={selectedAnswer === answer.number}
            >
              {answer.number}. <MathText text={answer.text} />
            </button>
          ))}
        </div>
      </article>

      {isPending ? (
        <p className={css.feedback} role="status">
          {isUltimate ? t("savingAnswer") : t("checkingAnswer")}
        </p>
      ) : null}

      {!isUltimate && checkResult ? (
        <p
          className={clsx(
            css.feedback,
            checkResult.correct ? css.feedbackOk : css.feedbackBad,
          )}
          role="status"
        >
          {checkResult.correct ? t("correct") : t("incorrect")}
        </p>
      ) : null}

      {errorMessage ? (
        <p className={clsx(css.feedback, css.feedbackBad)} role="alert">
          {errorMessage}
        </p>
      ) : null}

      <div className={css.actions}>
        {isUltimate ? (
          <>
            {checkResult === undefined && !isFinishing ? (
              <button type="button" className={css.skip} onClick={handleSkip}>
                {t("skip")}
              </button>
            ) : null}
            <button
              type="button"
              className={css.abort}
              onClick={handleAbortUltimate}
              disabled={isFinishing || isPending}
            >
              {t("abort")}
            </button>
          </>
        ) : (
          <>
            {!isLast ? (
              <button
                type="button"
                className={css.next}
                onClick={handleNext}
                disabled={checkResult === undefined || isPending}
              >
                {t("next")}
              </button>
            ) : null}

            {allAnswered ? (
              <button
                type="button"
                className={css.next}
                onClick={handleFinish}
                disabled={isFinishing || isPending}
              >
                {isFinishing ? t("finishing") : t("finish")}
              </button>
            ) : null}
          </>
        )}

        <Link href="/" className={css.backLink}>
          ← {t("backToTopics")}
        </Link>
      </div>
    </section>
  );
}
