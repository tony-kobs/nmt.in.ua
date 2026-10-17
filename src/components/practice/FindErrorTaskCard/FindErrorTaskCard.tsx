"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { useTranslations } from "next-intl";
import { MathText } from "@/components/ui/MathText";
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

  return (
    <div className={css.wrap}>
      <h3>{task.name}</h3>
      <MathText text={task.taskText} />

      <div className={css.lines} role="radiogroup" aria-label={t("findErrorLinesLabel")}>
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
              className={clsx(css.line, isSelected && css.selectedLine, isRevealedError && css.errorLine)}
              onClick={() => setSelectedLine(line.ord)}
            >
              <MathText text={line.text} />
            </button>
          );
        })}
      </div>

      <p className={css.optionsLabel}>{t("findErrorOptionsLabel")}</p>
      <div className={css.options} role="radiogroup" aria-label={t("findErrorOptionsLabel")}>
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
              className={clsx(css.option, isSelected && css.selectedOption, isCorrectOption && css.correctOption)}
              onClick={() => setSelectedOption(option.number)}
            >
              <MathText text={option.text} />
            </button>
          );
        })}
      </div>

      {result && !quiet ? (
        <p role="status">
          {diagnostic ? t("answerSaved") : result.correct
            ? t("correct")
            : result.retryAvailable
              ? t("retryPrompt")
              : t("incorrectLocked")}
        </p>
      ) : null}
      {revealed?.explanation && !quiet ? <MathText text={revealed.explanation} /> : null}
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
    </div>
  );
}
