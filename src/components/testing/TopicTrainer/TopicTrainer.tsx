"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import {
  checkAnswerAction,
  finishTrainerSessionAction,
  getSessionMistakeReviewAction,
  markSessionStartedAction,
  skipTaskAnswerAction,
} from "@/modules/testing/actions";
import type { SessionMistakeItem } from "@/modules/testing/getSessionMistakeReview";
import { formatElapsedClock } from "@/modules/testing/sessionElapsed";
import {
  ULTIMATE_DURATION_SEC,
  ULTIMATE_TIMER_WARNING_SEC,
} from "@/modules/testing/topicTestMode";
import {
  TASK_STATUS_CORRECT,
  TASK_STATUS_INCORRECT,
  type CheckAnswerActionInput,
  type CheckAnswerActionState,
  type SessionTask,
  type SessionTaskAnswer,
  type TrainerMode,
  type TrainerSessionSummary,
} from "@/modules/testing/types";
import { resolveTaskPresentation } from "@/modules/testing/taskPresentation";
import {
  resolveAnswerCardState,
  resolveAnswerFeedbackKind,
} from "@/modules/testing/answerCardState";
import type { RecommendedAction } from "@/modules/recommendations";
import type { DiagnosticTopicInsight } from "@/modules/diagnostic/diagnosticThemeBreakdown";
import { TopicTrainerSummary } from "@/components/testing/TopicTrainerSummary";
import { DiagnosticResultSummary } from "@/components/diagnostic/DiagnosticResultSummary";
import { MathText } from "@/components/ui/MathText";
import { TaskVisualArea } from "@/components/testing/TaskVisualArea";
import { AnswerStateIcon } from "./AnswerStateIcon";
import { useCountdownTimer } from "./useCountdownTimer";
import { useSessionTimer } from "./useSessionTimer";
import { useLocale, useTranslations } from "next-intl";
import css from "./TopicTrainer.module.css";

/** Lets the diagnostic session page swap in its own owner-aware Server
 * Actions without forking this component. Defaults to the standard
 * topic-test actions for every existing caller. */
type TopicTrainerActionOverrides = {
  checkAnswer: (
    input: CheckAnswerActionInput,
  ) => Promise<CheckAnswerActionState>;
  finishTrainerSession: typeof finishTrainerSessionAction;
  markSessionStarted: typeof markSessionStartedAction;
};

type TopicTrainerProps = {
  sessionId: number;
  /** `null` on a diagnostic attempt: it spans many themes, so the header shows
   * the theme name without a textbook link. */
  themeCode: string | null;
  themeName: string;
  tasks: SessionTask[];
  initialSummary?: TrainerSessionSummary | null;
  initialRecommendations?: RecommendedAction[];
  mode?: TrainerMode;
  /** Guest-owned diagnostic session — shown a "save progress" CTA in the
   * summary instead of the usual results/sessions links. */
  isGuest?: boolean;
  actions?: Partial<TopicTrainerActionOverrides>;
  /** Diagnostic-only: fetched as a follow-up call once the session finishes,
   * mirroring how Ultimate fetches its mistake review after finish. Not part
   * of `TopicTrainerActionOverrides` — no other mode has an equivalent. */
  diagnosticThemeBreakdownAction?: (sessionId: number) => Promise<DiagnosticTopicInsight>;
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
  isGuest = false,
  actions,
  diagnosticThemeBreakdownAction,
}: TopicTrainerProps) {
  const isUltimate = mode === "ultimate";
  const resolvedActions: TopicTrainerActionOverrides = useMemo(
    () => ({
      checkAnswer: actions?.checkAnswer ?? checkAnswerAction,
      finishTrainerSession:
        actions?.finishTrainerSession ?? finishTrainerSessionAction,
      markSessionStarted: actions?.markSessionStarted ?? markSessionStartedAction,
    }),
    [actions?.checkAnswer, actions?.finishTrainerSession, actions?.markSessionStarted],
  );
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
  const [topicInsight, setTopicInsight] = useState<DiagnosticTopicInsight | null>(
    null,
  );
  const [timedOut, setTimedOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const finishingRef = useRef(false);
  /** `pendingMappingId` only blocks the *next* render's clicks; two clicks
   * inside one frame both read the stale state and fire two actions. */
  const answeringRef = useRef(false);
  const t = useTranslations("TopicTrainer");
  const locale = useLocale() as "uk" | "en" | "de";

  const elapsedSec = useSessionTimer({
    sessionId,
    enabled: !isUltimate && summary == null,
    markSessionStarted: resolvedActions.markSessionStarted,
  });

  const finishUltimate = useCallback(
    async (options: { timedOut?: boolean } = {}) => {
      if (finishingRef.current || summary) return;
      finishingRef.current = true;
      setIsFinishing(true);
      setErrorMessage(null);
      if (options.timedOut) setTimedOut(true);

      const result = await resolvedActions.finishTrainerSession({
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
    [sessionId, summary, locale, t, resolvedActions],
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

  // Covers both a fresh finish and reopening an already-completed diagnostic
  // session (which arrives via `initialSummary`, never through `handleFinish`)
  // — either way, the breakdown loads once a diagnostic summary exists.
  useEffect(() => {
    if (mode !== "diagnostic" || !summary || !diagnosticThemeBreakdownAction) {
      return;
    }
    let cancelled = false;
    void diagnosticThemeBreakdownAction(summary.sessionId).then((insight) => {
      if (!cancelled) setTopicInsight(insight);
    });
    return () => {
      cancelled = true;
    };
  }, [mode, summary, diagnosticThemeBreakdownAction]);

  const currentTask = tasks[currentIndex];
  const presentation = currentTask ? resolveTaskPresentation(currentTask) : null;
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
    if (mode === "diagnostic") {
      return (
        <DiagnosticResultSummary
          summary={summary}
          topicInsight={topicInsight}
          isGuest={isGuest}
        />
      );
    }
    return (
      <TopicTrainerSummary
        summary={summary}
        recommendations={recommendations}
        mode={mode}
        timedOut={timedOut}
        mistakes={mistakes}
        isGuest={isGuest}
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
    if (checkResult || isPending || isFinishing || answeringRef.current) return;
    answeringRef.current = true;

    setSelectedByMappingId((prev) => ({
      ...prev,
      [currentTask.mappingId]: answerNumber,
    }));
    setErrorMessage(null);
    setPendingMappingId(currentTask.mappingId);

    let result: Awaited<ReturnType<typeof resolvedActions.checkAnswer>>;
    try {
      result = await resolvedActions.checkAnswer({
        sessionId,
        mappingId: currentTask.mappingId,
        answerNumber,
      });
    } finally {
      answeringRef.current = false;
      setPendingMappingId(null);
    }

    if (result.status !== "success") {
      // Let the student pick again: keeping the highlight on an answer that was
      // never recorded reads as "saved" while the buttons are live once more.
      setSelectedByMappingId((prev) => {
        const next = { ...prev };
        delete next[currentTask.mappingId];
        return next;
      });
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
    if (answeringRef.current) return;
    answeringRef.current = true;

    setErrorMessage(null);
    setPendingMappingId(currentTask.mappingId);

    let result: Awaited<ReturnType<typeof skipTaskAnswerAction>>;
    try {
      result = await skipTaskAnswerAction({
        sessionId,
        mappingId: currentTask.mappingId,
      });
    } finally {
      answeringRef.current = false;
      setPendingMappingId(null);
    }

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
    if (!allAnswered || isFinishing || isPending || finishingRef.current) return;
    finishingRef.current = true;

    setErrorMessage(null);
    setIsFinishing(true);

    let result: Awaited<ReturnType<typeof resolvedActions.finishTrainerSession>>;
    try {
      result = await resolvedActions.finishTrainerSession({ sessionId, locale });
    } finally {
      setIsFinishing(false);
    }

    if (result.status !== "success") {
      finishingRef.current = false;
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
            {isUltimate
              ? t("ultimateTitle")
              : mode === "diagnostic"
                ? t("diagnosticTitle")
                : t("title")}
          </h1>
          <p className={css.meta}>
            {t("session", { id: sessionId })}
            {" · "}
            {themeCode ? (
              <Link
                href={`/materials/textbook?topic=${encodeURIComponent(themeCode)}`}
                className={css.themeLink}
              >
                {themeName}
              </Link>
            ) : (
              themeName
            )}
          </p>
        </div>
        <div className={css.badges}>
          {isUltimate ? (
            <p className={clsx(css.modeBadge, css.modeUltimate)}>{t("ultimateTitle")}</p>
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
        <TaskVisualArea visual={presentation?.visual ?? null} />
        <MathText
          as="div"
          className={css.taskText}
          text={presentation?.displayText ?? currentTask.taskText}
        />

        <div
          className={css.answers}
          role="group"
          aria-label={t("answerOptions")}
        >
          {currentTask.answers.map((answer) => {
            const isSelected = selectedAnswer === answer.number;
            const cardState = resolveAnswerCardState({
              mode,
              isUltimate,
              isSelected,
              correct: checkResult?.correct,
            });
            return (
              <button
                key={answer.number}
                type="button"
                className={clsx(
                  css.answer,
                  cardState === "selected" && css.answerSelected,
                  cardState === "correct" && css.answerCorrect,
                  cardState === "incorrect" && css.answerWrong,
                )}
                onClick={() => handleSelect(answer.number)}
                disabled={isPending || checkResult !== undefined || isFinishing}
                aria-pressed={isSelected}
              >
                <span className={css.answerBadge} aria-hidden="true">
                  {answer.number}
                </span>
                <span className={css.answerText}>
                  <MathText text={answer.text} />
                </span>
                <AnswerStateIcon state={cardState} className={css.answerIcon} />
              </button>
            );
          })}
        </div>
      </article>

      {isPending ? (
        <p className={css.feedback} role="status">
          {isUltimate ? t("savingAnswer") : t("checkingAnswer")}
        </p>
      ) : null}

      {!isUltimate && checkResult
        ? (() => {
            const feedbackKind = resolveAnswerFeedbackKind(mode, checkResult.correct);
            return (
              <p
                className={clsx(
                  css.feedback,
                  feedbackKind === "correct" && css.feedbackOk,
                  feedbackKind === "incorrect" && css.feedbackBad,
                )}
                role="status"
              >
                {feedbackKind === "neutral"
                  ? t("answerSaved")
                  : feedbackKind === "correct"
                    ? t("correct")
                    : t("incorrect")}
              </p>
            );
          })()
        : null}

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
