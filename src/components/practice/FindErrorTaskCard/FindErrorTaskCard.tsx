"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { useTranslations } from "next-intl";
import { MathText } from "@/components/ui/MathText";
import { TestTaskCard } from "@/components/testing/TestTaskCard";
import cardCss from "@/components/testing/TestTaskCard/TestTaskCard.module.css";
import {
  getFindErrorTaskAction,
  submitFindErrorTaskAction,
} from "@/modules/stage2/actions";
import type { FindErrorReveal, FindErrorTaskPresentation } from "@/modules/stage2/findErrorTask";
import { Stage2Hints } from "../Stage2Hints";
import css from "./FindErrorTaskCard.module.css";

export function FindErrorTaskCard({ taskId, roundId, diagnostic = false, quiet = false, submitLabel, onAnswered }: { taskId: number; roundId?: number; diagnostic?: boolean; quiet?: boolean; submitLabel?: string; onAnswered?: () => void }) {
  const t = useTranslations("Stage2");
  const [task, setTask] = useState<FindErrorTaskPresentation | null>(null);
  const [selectedLine, setSelectedLine] = useState<number | null>(null);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [result, setResult] = useState<
    { correct: boolean; retryAvailable?: true; revealed?: FindErrorReveal } | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getFindErrorTaskAction(taskId, undefined, roundId).then((state) => {
      if (cancelled) return;
      if (state.status === "success") {
        setTask(state.task);
        const prior = state.task.priorResult;
        if (prior?.status === "correct") {
          setResult({ correct: true });
        } else if (prior?.status === "locked") {
          setResult({ correct: false, revealed: prior.revealed });
        } else if (prior?.status === "retry_available") {
          setResult({ correct: false, retryAvailable: true });
          if (prior.submitted) {
            setSelectedLine(prior.submitted.lineOrd);
            setSelectedOption(prior.submitted.correctionN);
          }
        }
      } else {
        setError(t("loadError"));
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [taskId, roundId, t]);

  if (loading) return <p role="status">{t("loading")}</p>;
  if (!task) return <p role="alert">{error ?? t("loadError")}</p>;

  const revealed = result?.revealed ?? null;
  const isLocked = result !== null && !result.retryAvailable;

  async function handleCheck() {
    if (checking || isLocked || selectedLine == null || selectedOption == null) return;
    setChecking(true);
    setError(null);
    try {
      const state = await submitFindErrorTaskAction({
        taskId,
        roundId,
        expectedAttempt: result?.retryAvailable ? 2 : 1,
        submittedLineOrd: selectedLine,
        submittedCorrectionN: selectedOption,
      });
      if (state.status === "success") { setResult(state); onAnswered?.(); }
      else setError(t("checkError"));
    } finally {
      setChecking(false);
    }
  }

  const note = !result || quiet
    ? undefined
    : diagnostic
      ? t("answerSaved")
      : result.correct
        ? undefined
        : result.retryAvailable
          ? t("retryPrompt")
          : t("incorrectLocked");

  return (
    <TestTaskCard
      heading="h3"
      title={<MathText text={task.name} />}
      prompt={<MathText as="div" text={task.taskText} />}
      hint={
        note || (revealed?.explanation && !quiet) ? (
          <>
            {note ? <span role="status">{note}</span> : null}
            {revealed?.explanation && !quiet ? <MathText text={revealed.explanation} /> : null}
          </>
        ) : undefined
      }
      result={!quiet && result?.correct && !diagnostic ? t("correct") : undefined}
    >
      <div className={`${cardCss.answers} ${cardCss.answersStack}`} role="radiogroup" aria-label={t("findErrorLinesLabel")}>
        {task.lines.map((line) => {
          const isSelected = selectedLine === line.ord;
          const isRevealedError = revealed?.errorLineOrd === line.ord;
          return (
            <button
              key={line.ord}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={isLocked}
              className={clsx(cardCss.option, isSelected && cardCss.optionSelected, isRevealedError && cardCss.optionWrong)}
              onClick={() => setSelectedLine(line.ord)}
            >
              <span className={cardCss.optionText}>
                <MathText text={line.text} />
              </span>
            </button>
          );
        })}
      </div>

      <p className={css.optionsLabel}>{t("findErrorOptionsLabel")}</p>
      <div className={cardCss.answers} role="radiogroup" aria-label={t("findErrorOptionsLabel")}>
        {task.correctionOptions.map((option) => {
          const isSelected = selectedOption === option.number;
          const isCorrectOption = revealed?.rightCorrectionN === option.number;
          return (
            <button
              key={option.number}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={isLocked}
              className={clsx(cardCss.option, isSelected && cardCss.optionSelected, isCorrectOption && cardCss.optionCorrect)}
              onClick={() => setSelectedOption(option.number)}
            >
              <span className={cardCss.optionText}>
                <MathText text={option.text} />
              </span>
            </button>
          );
        })}
      </div>

      {result?.retryAvailable && !diagnostic && !quiet ? <Stage2Hints format="find_error" taskId={taskId} roundId={roundId} /> : null}
      {error ? <p role="alert">{error}</p> : null}

      {!isLocked ? (
        <button
          type="button"
          className={css.checkButton}
          onClick={handleCheck}
          disabled={checking || selectedLine == null || selectedOption == null}
        >
          {checking ? t("checking") : submitLabel ?? t("check")}
        </button>
      ) : null}
    </TestTaskCard>
  );
}
