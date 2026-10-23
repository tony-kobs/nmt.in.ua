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
  getTaskHintLevelAction,
  addSimilarPracticeTaskAction,
  addSpacedRepetitionTaskAction,
} from "@/modules/testing/actions";
import type { SessionMistakeItem } from "@/modules/testing/getSessionMistakeReview";
import { formatElapsedClock } from "@/modules/testing/sessionElapsed";
import {
  ULTIMATE_DURATION_SEC,
  ULTIMATE_TIMER_WARNING_SEC,
} from "@/modules/testing/topicTestMode";
import { insertFollowUpTask } from "@/modules/testing/insertFollowUpTask";
import { isPracticeMode } from "@/modules/testing/sessionMode";
import {
  TASK_STATUS_CORRECT,
  TASK_STATUS_INCORRECT,
  type CheckAnswerActionInput,
  type CheckAnswerActionState,
  type HintLevel,
  type RevealedAnswerAction,
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
import type { PracticeResultInsight, RecommendedAction } from "@/modules/recommendations";
import type { DiagnosticTopicInsight } from "@/modules/diagnostic/diagnosticThemeBreakdown";
import type { DiagnosticAnswerReviewItem } from "@/modules/diagnostic/getDiagnosticAnswerReview";
import { TopicTrainerSummary } from "@/components/testing/TopicTrainerSummary";
import { DiagnosticResultSummary } from "@/components/diagnostic/DiagnosticResultSummary";
import { skipDiagnosticTaskAction } from "@/modules/diagnostic/actions";
import { SessionExpiredNotice } from "@/components/testing/SessionExpiredNotice";
import { MathText } from "@/components/ui/MathText";
import { TaskVisualArea } from "@/components/testing/TaskVisualArea";
import { TestTaskCard, optionLetter, taskKicker } from "@/components/testing/TestTaskCard";
import cardCss from "@/components/testing/TestTaskCard/TestTaskCard.module.css";
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
  /** Went-well/needs-attention breakdown for a Practice session reopened
   * after it was already completed. `null` for every other mode's initial load. */
  initialInsight?: PracticeResultInsight | null;
  mode?: TrainerMode;
  /** Guest-owned diagnostic session — shown a "save progress" CTA in the
   * summary instead of the usual results/sessions links. */
  isGuest?: boolean;
  actions?: Partial<TopicTrainerActionOverrides>;
  /** Diagnostic-only: fetched as a follow-up call once the session finishes,
   * mirroring how Ultimate fetches its mistake review after finish. Not part
   * of `TopicTrainerActionOverrides` — no other mode has an equivalent. */
  diagnosticThemeBreakdownAction?: (sessionId: number) => Promise<DiagnosticTopicInsight>;
  diagnosticAnswerReviewAction?: (sessionId: number) => Promise<DiagnosticAnswerReviewItem[]>;
  /** Index of the task to open first (e.g. the pending one when an adaptive
   * diagnostic page is reloaded). Defaults to the first task. */
  initialIndex?: number;
  /** Overrides the "N" in "task M / N" when the list is still growing
   * (adaptive diagnostic links tasks one at a time). */
  progressTotal?: number;
  /** Adaptive diagnostic only: once the last listed task is answered, the
   * primary action becomes "Next" and calls this instead of offering
   * "Finish". `"finish"` means nothing more will be linked, so the trainer
   * finishes as usual; `"continue"` means the page is re-reading the
   * server state and will remount the trainer. */
  onContinue?: () => Promise<"continue" | "finish" | "error">;
  /** Intro page: the cards replace the placeholder, so this is not a second page. */
  embed?: boolean;
};

/** Practice mode's second-attempt state travels alongside the plain
 * correct/incorrect flag: `retryAvailable` means the task is still "live"
 * (one more click permitted); `revealed` means it's fully locked and the
 * answer/explanation may be shown. Both are only ever set by the server
 * (`checkAnswer.ts`) — never inferred client-side. */
type CheckResult = {
  correct: boolean;
  retryAvailable?: boolean;
  revealed?: RevealedAnswerAction;
};

function initialResults(tasks: SessionTask[]): Record<number, CheckResult> {
  const results: Record<number, CheckResult> = {};
  for (const task of tasks) {
    if (task.status === TASK_STATUS_CORRECT)
      results[task.mappingId] = { correct: true };
    if (task.status === TASK_STATUS_INCORRECT)
      results[task.mappingId] = { correct: false, retryAvailable: task.retryAvailable, revealed: task.revealed };
  }
  return results;
}

/** One task's hint-ladder progress: rungs already fetched, in order. */
type HintProgress = { level: HintLevel; text: string; isFinal: boolean }[];

export function TopicTrainer({
  sessionId,
  themeCode,
  themeName,
  tasks,
  initialSummary = null,
  initialRecommendations = [],
  initialInsight = null,
  mode = "standard",
  isGuest = false,
  actions,
  diagnosticThemeBreakdownAction,
  diagnosticAnswerReviewAction,
  initialIndex = 0,
  progressTotal,
  onContinue,
  embed = false,
}: TopicTrainerProps) {
  const isUltimate = mode === "ultimate";
  const isPractice = isPracticeMode(mode);
  const resolvedActions: TopicTrainerActionOverrides = useMemo(
    () => ({
      checkAnswer: actions?.checkAnswer ?? checkAnswerAction,
      finishTrainerSession:
        actions?.finishTrainerSession ?? finishTrainerSessionAction,
      markSessionStarted: actions?.markSessionStarted ?? markSessionStartedAction,
    }),
    [actions?.checkAnswer, actions?.finishTrainerSession, actions?.markSessionStarted],
  );
  const [currentIndex, setCurrentIndex] = useState(() =>
    Math.min(Math.max(initialIndex, 0), Math.max(tasks.length - 1, 0)),
  );
  const [taskList, setTaskList] = useState<SessionTask[]>(tasks);
  const [selectedByMappingId, setSelectedByMappingId] = useState<
    Record<number, SessionTaskAnswer["number"]>
  >({});
  const [resultsByMappingId, setResultsByMappingId] = useState(() =>
    initialResults(tasks),
  );
  const [hintsByMappingId, setHintsByMappingId] = useState<Record<number, HintProgress>>(
    () => Object.fromEntries(tasks.filter((task) => task.hints?.length).map((task) => [task.mappingId, task.hints!])),
  );
  const [hintLoading, setHintLoading] = useState(false);
  const [similarTaskLoading, setSimilarTaskLoading] = useState(false);
  const [pendingMappingId, setPendingMappingId] = useState<number | null>(null);
  const [isFinishing, setIsFinishing] = useState(false);
  const [isContinuing, setIsContinuing] = useState(false);
  const [summary, setSummary] = useState<TrainerSessionSummary | null>(
    initialSummary,
  );
  const [recommendations, setRecommendations] = useState<RecommendedAction[]>(
    initialRecommendations,
  );
  const [insight, setInsight] = useState<PracticeResultInsight | null>(
    initialInsight,
  );
  const [mistakes, setMistakes] = useState<SessionMistakeItem[]>([]);
  const [topicInsight, setTopicInsight] = useState<DiagnosticTopicInsight | null>(
    null,
  );
  const [answerReview, setAnswerReview] = useState<DiagnosticAnswerReviewItem[] | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const finishingRef = useRef(false);
  /** `pendingMappingId` only blocks the *next* render's clicks; two clicks
   * inside one frame both read the stale state and fire two actions. */
  const answeringRef = useRef(false);
  const t = useTranslations("TopicTrainer");
  const locale = useLocale() as "uk" | "en" | "de";

  const { elapsedSec, expired: sessionTimerExpired } = useSessionTimer({
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
      setInsight(result.insight);
    },
    [sessionId, summary, locale, t, resolvedActions],
  );

  const handleTimeExpired = useCallback(() => {
    void finishUltimate({ timedOut: true });
  }, [finishUltimate]);

  const { remainingSec, sessionExpired: countdownSessionExpired } =
    useCountdownTimer({
      sessionId,
      enabled: isUltimate && summary == null,
      durationSec: ULTIMATE_DURATION_SEC,
      onExpire: handleTimeExpired,
    });

  const sessionExpired = sessionTimerExpired || countdownSessionExpired;

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

  useEffect(() => {
    if (mode !== "diagnostic" || !summary || !diagnosticAnswerReviewAction) {
      return;
    }
    let cancelled = false;
    void diagnosticAnswerReviewAction(summary.sessionId)
      .then((review) => {
        if (!cancelled) setAnswerReview(review);
      })
      .catch(() => {
        if (!cancelled) setAnswerReview([]);
      });
    return () => {
      cancelled = true;
    };
  }, [mode, summary, diagnosticAnswerReviewAction]);

  const currentTask = taskList[currentIndex];
  const presentation = currentTask ? resolveTaskPresentation(currentTask) : null;
  const total = taskList.length;
  const selectedAnswer = currentTask
    ? selectedByMappingId[currentTask.mappingId]
    : undefined;
  const checkResult = currentTask
    ? resultsByMappingId[currentTask.mappingId]
    : undefined;
  const hintProgress = currentTask ? hintsByMappingId[currentTask.mappingId] : undefined;
  const isPending =
    currentTask != null && pendingMappingId === currentTask.mappingId;
  const isLast = currentIndex === total - 1;
  const allAnswered =
    taskList.length > 0 &&
    taskList.every((task) => resultsByMappingId[task.mappingId] !== undefined);
  // A task is "resolved" (locked, no more attempts) once it's correct, or
  // wrong without a retry on offer (diagnostic/exam), or wrong AND already
  // revealed (retry consumed). While `retryAvailable` is true the task is
  // still "live" — one more click is allowed.
  const isResolved = checkResult !== undefined && !checkResult.retryAvailable;

  if (sessionExpired && !summary) {
    return <SessionExpiredNotice />;
  }

  if (summary) {
    if (mode === "diagnostic") {
      return (
        <DiagnosticResultSummary
          summary={summary}
          topicInsight={topicInsight}
          answerReview={answerReview}
          isGuest={isGuest}
          titleLevel={embed ? "h2" : "h1"}
        />
      );
    }
    return (
      <TopicTrainerSummary
        summary={summary}
        recommendations={recommendations}
        insight={insight}
        mode={mode}
        timedOut={timedOut}
        mistakes={mistakes}
        isGuest={isGuest}
        sessionId={sessionId}
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

  /** Practice mode only: after a task fully resolves, opportunistically
   * check whether a theme is due for spaced repetition and silently splice
   * one more task into the list if so. Never blocks the UI, never surfaces
   * an error — "nothing due" and "network hiccup" look the same to the
   * student (there was simply no repetition this time). */
  async function maybeAddRepetition() {
    if (!isPractice) return;
    try {
      const result = await addSpacedRepetitionTaskAction({ sessionId });
      if (result.status === "success" && result.added) {
        setTaskList((prev) => {
          const { list } = insertFollowUpTask(prev, prev.length - 1, result.task);
          return list;
        });
      }
    } catch {
      // Best-effort only — see doc comment above.
    }
  }

  async function handleSelect(answerNumber: SessionTaskAnswer["number"]) {
    if (isPending || isFinishing || answeringRef.current) return;
    if (isResolved) return;
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
        attempt: checkResult?.retryAvailable ? 2 : 1,
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

    if (mode === "diagnostic") {
      await runDiagnosticAdvance();
      return;
    }

    setResultsByMappingId((prev) => ({
      ...prev,
      [currentTask.mappingId]: {
        correct: result.correct,
        retryAvailable: result.retryAvailable,
        revealed: result.revealed,
      },
    }));

    if (isPractice && (result.correct || result.revealed)) {
      void maybeAddRepetition();
    }
  }

  async function handleShowNextHint() {
    if (!isPractice || hintLoading) return;
    const nextLevel = ((hintProgress?.length ?? 0) + 1) as HintLevel;
    if (nextLevel > 3) return;
    setHintLoading(true);
    try {
      const result = await getTaskHintLevelAction({
        sessionId,
        mappingId: currentTask.mappingId,
        level: nextLevel,
      });
      if (result.status === "success" && result.available && result.text && result.level) {
        setHintsByMappingId((prev) => ({
          ...prev,
          [currentTask.mappingId]: [
            ...(prev[currentTask.mappingId] ?? []),
            { level: result.level as HintLevel, text: result.text as string, isFinal: result.isFinal },
          ],
        }));
      }
    } finally {
      setHintLoading(false);
    }
  }

  async function handleTrySimilarTask() {
    if (!isPractice || similarTaskLoading) return;
    setSimilarTaskLoading(true);
    setErrorMessage(null);
    try {
      const result = await addSimilarPracticeTaskAction({
        sessionId,
        mappingId: currentTask.mappingId,
      });
      if (result.status === "success") {
        setTaskList((prev) => {
          const { list, index } = insertFollowUpTask(prev, currentIndex, result.task);
          setCurrentIndex(index);
          return list;
        });
      } else if (result.code !== "noSimilarTask") {
        setErrorMessage(t(`errors.similarTask.${result.code}`));
      }
    } finally {
      setSimilarTaskLoading(false);
    }
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

  async function completeSession() {
    if (isFinishing || finishingRef.current) return;
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
    setInsight(result.insight);
  }

  async function runDiagnosticAdvance() {
    answeringRef.current = true;
    try {
      if (onContinue) {
        setIsContinuing(true);
        const next = await onContinue();
        if (next === "finish") {
          setIsContinuing(false);
          await completeSession();
          return;
        }
        if (next === "error") {
          setIsContinuing(false);
          setErrorMessage(t("errors.continue"));
        }
        return;
      }
      if (currentIndex < taskList.length - 1) {
        setCurrentIndex((index) => index + 1);
        setErrorMessage(null);
        return;
      }
      await completeSession();
    } finally {
      answeringRef.current = false;
    }
  }

  async function handleDiagnosticSkip() {
    if (mode !== "diagnostic" || isResolved || isPending || isFinishing || isContinuing) return;
    if (answeringRef.current) return;
    answeringRef.current = true;
    setErrorMessage(null);
    setPendingMappingId(currentTask.mappingId);

    let result: Awaited<ReturnType<typeof skipDiagnosticTaskAction>>;
    try {
      result = await skipDiagnosticTaskAction({
        sessionId,
        mappingId: currentTask.mappingId,
      });
    } finally {
      answeringRef.current = false;
      setPendingMappingId(null);
    }

    if (result.status !== "success") {
      setErrorMessage(t(`errors.checkAnswer.${result.code}`));
      return;
    }

    await runDiagnosticAdvance();
  }

  async function handleFinish() {
    if (!allAnswered || isFinishing || isPending || finishingRef.current) return;
    await completeSession();
  }

  async function handleContinue() {
    if (!onContinue || isContinuing || isFinishing || isPending) return;
    setErrorMessage(null);
    await runDiagnosticAdvance();
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
  const promptText = presentation?.displayText ?? currentTask.taskText;
  const kicker = taskKicker(currentTask.name, promptText);
  const showVerdict = !isUltimate && mode !== "diagnostic" && checkResult !== undefined;
  const resultLabel = !showVerdict || !checkResult
    ? null
    : checkResult.revealed?.correctAnswerText
      ? checkResult.revealed.correctAnswerText
      : checkResult.correct
        ? t("correct")
        : null;

  return (
    <section
      className={clsx(css.topicTrainer, embed && css.embed)}
      aria-labelledby={embed ? "topic-task-title" : "topic-trainer-title"}
    >
      <header className={css.header}>
        {embed ? null : (
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
        )}
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
            {t("taskProgress", {
              current: currentIndex + 1,
              total: progressTotal ?? total,
            })}
          </p>
        </div>
      </header>

      <TestTaskCard
        titleId="topic-task-title"
        title={t("taskHeading", { number: currentIndex + 1 })}
        badge={themeName}
        kicker={kicker ? <MathText text={kicker} /> : undefined}
        prompt={
          <>
            <TaskVisualArea visual={presentation?.visual ?? null} />
            <MathText as="div" text={promptText} />
          </>
        }
        hint={
          isPractice && checkResult?.revealed?.explanation ? (
            <MathText text={checkResult.revealed.explanation} />
          ) : isPractice && checkResult?.retryAvailable ? (
            <>
              <span>{t("retryPrompt")}</span>
              {hintProgress?.map((rung) => (
                <MathText key={rung.level} text={rung.text} />
              ))}
            </>
          ) : showVerdict && checkResult && !checkResult.correct ? (
            t("incorrect")
          ) : undefined
        }
        result={
          resultLabel ? (
            checkResult?.revealed?.correctAnswerText ? (
              <MathText text={checkResult.revealed.correctAnswerText} />
            ) : (
              resultLabel
            )
          ) : undefined
        }
      >
        <div className={cardCss.answers} role="group" aria-label={t("answerOptions")}>
          {currentTask.answers.map((answer) => {
            const isSelected = selectedAnswer === answer.number;
            const isRevealedCorrect =
              checkResult?.revealed?.correctAnswerNumber === answer.number;
            const cardState = isRevealedCorrect
              ? "correct"
              : resolveAnswerCardState({
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
                  cardCss.option,
                  cardState === "selected" && cardCss.optionSelected,
                  cardState === "correct" && cardCss.optionCorrect,
                  cardState === "incorrect" && cardCss.optionWrong,
                )}
                onMouseDown={
                  mode === "diagnostic"
                    ? (event) => event.preventDefault()
                    : undefined
                }
                onClick={() => handleSelect(answer.number)}
                disabled={
                  isPending ||
                  isResolved ||
                  isFinishing ||
                  (mode === "diagnostic" && isContinuing)
                }
                aria-pressed={isSelected}
              >
                <span className={cardCss.mark} aria-hidden="true">
                  {optionLetter(answer.number - 1)})
                </span>
                <span className={cardCss.optionText}>
                  <MathText text={answer.text} />
                </span>
                <AnswerStateIcon state={cardState} className={css.answerIcon} />
              </button>
            );
          })}
        </div>
      </TestTaskCard>

      {isPending ? (
        <p className="visually-hidden" role="status">
          {isUltimate ? t("savingAnswer") : t("checkingAnswer")}
        </p>
      ) : null}

      {!isUltimate && checkResult
        ? (() => {
            const feedbackKind = resolveAnswerFeedbackKind(
              mode,
              checkResult.correct,
            );
            return (
              <p className="visually-hidden" role="status">
                {feedbackKind === "neutral"
                  ? t("answerSaved")
                  : checkResult.retryAvailable
                    ? t("retryAvailable")
                    : feedbackKind === "correct"
                      ? t("correct")
                      : t("incorrect")}
              </p>
            );
          })()
        : null}

      {/* Practice-only affordances: second-attempt prompt, hint ladder,
          reveal + reinforcement. Never rendered for diagnostic/exam. */}
      {isPractice && checkResult?.retryAvailable &&
      (!hintProgress || !hintProgress[hintProgress.length - 1]?.isFinal) ? (
        <div className={css.practicePanel}>
          <button
            type="button"
            className={css.hintButton}
            onClick={handleShowNextHint}
            disabled={hintLoading}
          >
            {hintLoading
              ? t("hintLoading")
              : hintProgress && hintProgress.length > 0
                ? t("showNextHint")
                : t("showHint")}
          </button>
        </div>
      ) : null}

      {isPractice && checkResult?.revealed ? (
        <div className={css.practicePanel}>
          <button
            type="button"
            className={css.hintButton}
            onClick={handleTrySimilarTask}
            disabled={similarTaskLoading}
          >
            {similarTaskLoading ? t("similarTaskLoading") : t("similarTask")}
          </button>
        </div>
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
        ) : mode === "diagnostic" ? (
          <button
            type="button"
            className={css.next}
            onClick={handleDiagnosticSkip}
            disabled={isResolved || isPending || isContinuing || isFinishing}
          >
            {t("skipTask")}
          </button>
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

            {onContinue && isLast ? (
              <button
                type="button"
                className={css.next}
                onClick={handleContinue}
                disabled={
                  checkResult === undefined ||
                  isPending ||
                  isContinuing ||
                  isFinishing
                }
              >
                {isFinishing ? t("finishing") : t("next")}
              </button>
            ) : allAnswered ? (
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

        {embed ? null : (
          <Link href="/" className={css.backLink}>
            ← {t("backToTopics")}
          </Link>
        )}
      </div>
    </section>
  );
}
