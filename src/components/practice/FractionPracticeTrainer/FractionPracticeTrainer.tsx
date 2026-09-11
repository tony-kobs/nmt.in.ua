"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { PageFrame, PagePanel } from "@/components/dashboard/PageFrame";
import { ModeTabs } from "@/components/ui/ModeTabs";
import { MathText } from "@/components/ui/MathText";
import type { FractionAdditionDifficulty } from "@/modules/problemGenerators";
import {
  checkFractionPracticeAnswerAction,
  nextFractionPracticeTaskAction,
  startFractionPracticeTaskAction,
  type FractionPracticeCheckState,
} from "@/modules/fractionPractice/actions";
import { fractionQuestionSignature } from "@/modules/fractionPractice/presentation";
import type { FractionPracticeQuestion } from "@/modules/fractionPractice/presentation";
import css from "./FractionPracticeTrainer.module.css";

const LEVELS: FractionAdditionDifficulty[] = [1, 2, 3, 4, 5];
const MIN_TASK_COUNT = 3;
const MAX_TASK_COUNT = 20;
const DEFAULT_TASK_COUNT = 10;

type Phase = "start" | "active" | "summary";

type CheckOutcome = Extract<FractionPracticeCheckState, { status: "success" }>;

function isMissingNumerator(
  question: FractionPracticeQuestion,
): question is Extract<FractionPracticeQuestion, { kind: "missingNumerator" }> {
  return question.kind === "missingNumerator";
}

export function FractionPracticeTrainer() {
  const t = useTranslations("FractionPractice");

  const [phase, setPhase] = useState<Phase>("start");
  const [level, setLevel] = useState<FractionAdditionDifficulty>(1);
  const [taskCountInput, setTaskCountInput] = useState(String(DEFAULT_TASK_COUNT));

  const [question, setQuestion] = useState<FractionPracticeQuestion | null>(null);
  const [seed, setSeed] = useState<number | null>(null);
  const [answerDraft, setAnswerDraft] = useState("");
  const [checkResult, setCheckResult] = useState<CheckOutcome | null>(null);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const parsedTaskCount = Number(taskCountInput);
  const taskCountValid =
    Number.isInteger(parsedTaskCount) &&
    parsedTaskCount >= MIN_TASK_COUNT &&
    parsedTaskCount <= MAX_TASK_COUNT;
  const taskCount = taskCountValid ? parsedTaskCount : DEFAULT_TASK_COUNT;

  async function handleStart() {
    if (!taskCountValid || isBusy) return;
    setIsBusy(true);
    setErrorMessage(null);

    const result = await startFractionPracticeTaskAction({ level });

    setIsBusy(false);
    if (result.status !== "success") {
      setErrorMessage(t(`errors.${result.code}`));
      return;
    }

    setQuestion(result.question);
    setSeed(result.seed);
    setAnswerDraft("");
    setCheckResult(null);
    setAnsweredCount(0);
    setCorrectCount(0);
    setPhase("active");
  }

  async function handleSubmitAnswer() {
    if (!question || seed === null || !answerDraft.trim() || isBusy || checkResult) return;
    setIsBusy(true);
    setErrorMessage(null);

    const result = await checkFractionPracticeAnswerAction({
      level,
      seed,
      answer: answerDraft.trim(),
    });

    setIsBusy(false);
    if (result.status !== "success") {
      setErrorMessage(t(`errors.${result.code}`));
      return;
    }

    setCheckResult(result);
    setAnsweredCount((count) => count + 1);
    if (result.isCorrect) setCorrectCount((count) => count + 1);
  }

  async function handleNext() {
    if (!question || isBusy) return;

    if (answeredCount >= taskCount) {
      setPhase("summary");
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);

    const result = await nextFractionPracticeTaskAction({
      level,
      previousSignature: fractionQuestionSignature(question),
    });

    setIsBusy(false);
    if (result.status !== "success") {
      setErrorMessage(t(`errors.${result.code}`));
      return;
    }

    setQuestion(result.question);
    setSeed(result.seed);
    setAnswerDraft("");
    setCheckResult(null);
  }

  function handleRestart() {
    setPhase("start");
    setQuestion(null);
    setSeed(null);
    setErrorMessage(null);
  }

  if (phase === "summary") {
    const percent =
      taskCount > 0 ? Math.round((correctCount / taskCount) * 100) : 0;
    return (
      <PageFrame
        className={css.frame}
        kicker={t("kicker")}
        title={t("summaryTitle")}
        lead={t("summaryLead", { correct: correctCount, total: taskCount, percent })}
      >
        <PagePanel className={css.summaryPanel}>
          <p className={css.summaryScore}>
            {correctCount} / {taskCount}
          </p>
          <div className={css.summaryActions}>
            <button type="button" className={css.primaryButton} onClick={handleRestart}>
              {t("practiceAgain")}
            </button>
            <Link href="/" className={css.backLink}>
              ← {t("backToPractice")}
            </Link>
          </div>
        </PagePanel>
      </PageFrame>
    );
  }

  if (phase === "active" && question) {
    const feedbackKind =
      checkResult == null
        ? null
        : checkResult.reason === "correct"
          ? "correct"
          : checkResult.reason === "reductionRequired"
            ? "reductionRequired"
            : "incorrect";
    const isLastTask = answeredCount >= taskCount;

    return (
      <PageFrame
        className={css.frame}
        kicker={t("kicker")}
        title={t("activeTitle")}
        lead={t("taskProgress", { current: Math.min(answeredCount + 1, taskCount), total: taskCount })}
      >
        <PagePanel>
          <p className={css.scoreLine} aria-live="polite">
            {t("scoreLine", { correct: correctCount, answered: answeredCount })}
          </p>

          <MathText as="div" className={css.questionMath} text={question.questionMath} />

          <form
            className={css.answerForm}
            onSubmit={(event) => {
              event.preventDefault();
              void handleSubmitAnswer();
            }}
          >
            <label className={css.answerLabel} htmlFor="fraction-practice-answer">
              {isMissingNumerator(question) ? t("answerLabelInteger") : t("answerLabelFraction")}
            </label>
            <input
              id="fraction-practice-answer"
              className={css.answerInput}
              value={answerDraft}
              onChange={(event) => setAnswerDraft(event.currentTarget.value)}
              disabled={isBusy || checkResult !== null}
              inputMode={isMissingNumerator(question) ? "numeric" : "text"}
              autoComplete="off"
              placeholder={isMissingNumerator(question) ? t("answerPlaceholderInteger") : t("answerPlaceholderFraction")}
            />
            {checkResult === null ? (
              <button
                type="submit"
                className={css.primaryButton}
                disabled={isBusy || !answerDraft.trim()}
              >
                {t("submit")}
              </button>
            ) : null}
          </form>

          {feedbackKind ? (
            <p
              className={
                feedbackKind === "correct"
                  ? css.feedbackOk
                  : feedbackKind === "reductionRequired"
                    ? css.feedbackWarn
                    : css.feedbackBad
              }
              role="status"
            >
              {feedbackKind === "correct"
                ? t("feedbackCorrect")
                : feedbackKind === "reductionRequired"
                  ? t("feedbackReductionRequired")
                  : t("feedbackIncorrect")}
            </p>
          ) : null}

          {checkResult ? (
            <button
              type="button"
              className={css.primaryButton}
              onClick={() => void handleNext()}
              disabled={isBusy}
            >
              {isLastTask ? t("finish") : t("next")}
            </button>
          ) : null}

          {errorMessage ? (
            <p className={css.feedbackBad} role="alert">
              {errorMessage}
            </p>
          ) : null}
        </PagePanel>
      </PageFrame>
    );
  }

  return (
    <PageFrame
      className={css.frame}
      kicker={t("kicker")}
      title={t("startTitle")}
      lead={t("startLead")}
    >
      <PagePanel>
        <div className={css.field}>
          <span className={css.label}>{t("selectLevel")}</span>
          <ModeTabs
            value={String(level)}
            onChange={(value) => setLevel(Number(value) as FractionAdditionDifficulty)}
            options={LEVELS.map((value) => ({ id: String(value), label: String(value) }))}
            ariaLabel={t("selectLevel")}
          />
          <span className={css.hint}>{t(`levelDescription.${level}`)}</span>
        </div>

        <div className={css.field}>
          <label className={css.label} htmlFor="fraction-practice-count">
            {t("taskCount")}
          </label>
          <input
            id="fraction-practice-count"
            className={css.countInput}
            type="number"
            inputMode="numeric"
            min={MIN_TASK_COUNT}
            max={MAX_TASK_COUNT}
            step={1}
            value={taskCountInput}
            onChange={(event) => setTaskCountInput(event.currentTarget.value)}
            autoComplete="off"
          />
          <span className={css.hint}>
            {t("taskCountHint", { min: MIN_TASK_COUNT, max: MAX_TASK_COUNT })}
          </span>
        </div>

        <button
          type="button"
          className={css.primaryButton}
          onClick={() => void handleStart()}
          disabled={!taskCountValid || isBusy}
        >
          {isBusy ? t("loading") : t("start")}
        </button>

        {errorMessage ? (
          <p className={css.feedbackBad} role="alert">
            {errorMessage}
          </p>
        ) : null}
      </PagePanel>
    </PageFrame>
  );
}
