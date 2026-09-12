"use client";

import { useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { PageFrame, PagePanel } from "@/components/dashboard/PageFrame";
import { ModeTabs } from "@/components/ui/ModeTabs";
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

function FractionStack({
  numerator,
  denominator,
  numeratorInput,
  denominatorInput,
  ariaLabel,
}: {
  numerator?: ReactNode;
  denominator?: ReactNode;
  numeratorInput?: ReactNode;
  denominatorInput?: ReactNode;
  ariaLabel?: string;
}) {
  return (
    <div className={css.fraction} aria-label={ariaLabel}>
      {numeratorInput ?? <span className={css.fracPart}>{numerator}</span>}
      <span className={css.fracBar} aria-hidden>
        —
      </span>
      {denominatorInput ?? <span className={css.fracPart}>{denominator}</span>}
    </div>
  );
}

function Operator({ children }: { children: string }) {
  return (
    <span className={css.operator} aria-hidden>
      {children}
    </span>
  );
}

export function FractionPracticeTrainer() {
  const t = useTranslations("FractionPractice");
  const formId = useId();

  const [phase, setPhase] = useState<Phase>("start");
  const [level, setLevel] = useState<FractionAdditionDifficulty>(1);
  const [taskCountInput, setTaskCountInput] = useState(String(DEFAULT_TASK_COUNT));

  const [question, setQuestion] = useState<FractionPracticeQuestion | null>(null);
  const [seed, setSeed] = useState<number | null>(null);
  const [answerNumerator, setAnswerNumerator] = useState("");
  const [answerDenominator, setAnswerDenominator] = useState("");
  const [missingDraft, setMissingDraft] = useState("");
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

  const canSubmitSum =
    answerNumerator.trim().length > 0 && answerDenominator.trim().length > 0;
  const canSubmitMissing = missingDraft.trim().length > 0;
  const lockedAfterCorrect = checkResult?.isCorrect === true;

  function resetAnswerFields() {
    setAnswerNumerator("");
    setAnswerDenominator("");
    setMissingDraft("");
    setCheckResult(null);
  }

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
    resetAnswerFields();
    setAnsweredCount(0);
    setCorrectCount(0);
    setPhase("active");
  }

  async function handleSubmitAnswer() {
    if (!question || seed === null || isBusy || lockedAfterCorrect) return;

    const answer =
      question.kind === "missingNumerator"
        ? missingDraft.trim()
        : `${answerNumerator.trim()}/${answerDenominator.trim()}`;

    if (!answer || (question.kind === "sum" && !canSubmitSum)) return;
    if (question.kind === "missingNumerator" && !canSubmitMissing) return;

    setIsBusy(true);
    setErrorMessage(null);

    const result = await checkFractionPracticeAnswerAction({
      level,
      seed,
      answer,
    });

    setIsBusy(false);
    if (result.status !== "success") {
      setErrorMessage(t(`errors.${result.code}`));
      return;
    }

    const firstCheckOnThisTask = checkResult === null;
    setCheckResult(result);
    if (firstCheckOnThisTask) {
      setAnsweredCount((count) => count + 1);
      if (result.isCorrect) setCorrectCount((count) => count + 1);
    } else if (result.isCorrect && checkResult && !checkResult.isCorrect) {
      setCorrectCount((count) => count + 1);
    }
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
    resetAnswerFields();
  }

  function handleRestart() {
    setPhase("start");
    setQuestion(null);
    setSeed(null);
    setErrorMessage(null);
  }

  function renderEquation(active: FractionPracticeQuestion) {
    if (active.kind === "sum") {
      return (
        <div
          className={css.equation}
          role="group"
          aria-label={t("equationAria")}
        >
          {active.operandNumerators.map((numerator, index) => (
            <div key={`${numerator}-${index}`} className={css.equationItem}>
              {index > 0 ? <Operator>+</Operator> : null}
              <FractionStack
                numerator={numerator}
                denominator={active.denominator}
              />
            </div>
          ))}
          <Operator>=</Operator>
          <FractionStack
            ariaLabel={t("answerFractionAria")}
            numeratorInput={
              <input
                id={`${formId}-num`}
                className={css.fracInput}
                value={answerNumerator}
                onChange={(event) => {
                  setAnswerNumerator(event.currentTarget.value);
                  if (checkResult && !checkResult.isCorrect) setCheckResult(null);
                }}
                disabled={isBusy || lockedAfterCorrect}
                inputMode="numeric"
                autoComplete="off"
                aria-label={t("answerNumerator")}
              />
            }
            denominatorInput={
              <input
                id={`${formId}-den`}
                className={css.fracInput}
                value={answerDenominator}
                onChange={(event) => {
                  setAnswerDenominator(event.currentTarget.value);
                  if (checkResult && !checkResult.isCorrect) setCheckResult(null);
                }}
                disabled={isBusy || lockedAfterCorrect}
                inputMode="numeric"
                autoComplete="off"
                aria-label={t("answerDenominator")}
              />
            }
          />
        </div>
      );
    }

    const blank = (
      <FractionStack
        ariaLabel={t("missingNumeratorAria")}
        numeratorInput={
          <input
            id={`${formId}-missing`}
            className={css.fracInput}
            value={missingDraft}
            onChange={(event) => {
              setMissingDraft(event.currentTarget.value);
              if (checkResult && !checkResult.isCorrect) setCheckResult(null);
            }}
            disabled={isBusy || lockedAfterCorrect}
            inputMode="numeric"
            autoComplete="off"
            aria-label={t("answerNumerator")}
          />
        }
        denominator={active.denominator}
      />
    );
    const known = (
      <FractionStack
        numerator={active.knownNumerator}
        denominator={active.denominator}
      />
    );
    const result = (
      <FractionStack
        numerator={active.resultNumerator}
        denominator={active.denominator}
      />
    );

    return (
      <div className={css.equation} role="group" aria-label={t("equationAria")}>
        {active.unknownPosition === "first" ? blank : known}
        <Operator>+</Operator>
        {active.unknownPosition === "first" ? known : blank}
        <Operator>=</Operator>
        {result}
      </div>
    );
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
    const canSubmit =
      question.kind === "missingNumerator" ? canSubmitMissing : canSubmitSum;

    return (
      <PageFrame
        className={css.frame}
        kicker={t("kicker")}
        title={t("activeTitle")}
        lead={t("taskProgress", {
          current: Math.min(answeredCount + 1, taskCount),
          total: taskCount,
        })}
      >
        <PagePanel>
          <p className={css.scoreLine} aria-live="polite">
            {t("scoreLine", { correct: correctCount, answered: answeredCount })}
          </p>

          <form
            className={css.answerForm}
            onSubmit={(event) => {
              event.preventDefault();
              void handleSubmitAnswer();
            }}
          >
            <div className={css.board}>
              {feedbackKind === "correct" ? (
                <span
                  className={`${css.cornerMark} ${css.cornerOk}`}
                  role="status"
                  aria-label={t("feedbackCorrect")}
                >
                  <svg viewBox="0 0 48 48" className={css.cornerSvg} aria-hidden>
                    <circle className={css.cornerRing} cx="24" cy="24" r="22" />
                    <path
                      className={css.cornerCheck}
                      d="M14.5 24.5 21 31l12.5-14"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              ) : null}
              {feedbackKind === "incorrect" ? (
                <span
                  className={`${css.cornerMark} ${css.cornerBad}`}
                  role="status"
                  aria-label={t("feedbackIncorrect")}
                >
                  <svg viewBox="0 0 48 48" className={css.cornerSvg} aria-hidden>
                    <circle className={css.cornerRing} cx="24" cy="24" r="22" />
                    <path
                      className={css.cornerStroke}
                      d="M17 17 31 31M31 17 17 31"
                      fill="none"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
              ) : null}
              {feedbackKind === "reductionRequired" ? (
                <span
                  className={`${css.cornerMark} ${css.cornerWarn}`}
                  role="status"
                  aria-label={t("feedbackReductionRequired")}
                >
                  <svg viewBox="0 0 48 48" className={css.cornerSvg} aria-hidden>
                    <circle className={css.cornerRing} cx="24" cy="24" r="22" />
                    <path
                      className={css.cornerStroke}
                      d="M24 14v14M24 34.5v.5"
                      fill="none"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
              ) : null}
              {renderEquation(question)}
            </div>

            {!lockedAfterCorrect ? (
              <button
                type="submit"
                className={css.primaryButton}
                disabled={isBusy || !canSubmit}
              >
                {t("submit")}
              </button>
            ) : (
              <button
                type="button"
                className={css.primaryButton}
                onClick={() => void handleNext()}
                disabled={isBusy}
              >
                {isLastTask ? t("finish") : t("next")}
              </button>
            )}
          </form>

          {!lockedAfterCorrect && checkResult && !checkResult.isCorrect ? (
            <button
              type="button"
              className={css.secondaryButton}
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
