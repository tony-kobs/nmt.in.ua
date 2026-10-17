"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { useTranslations } from "next-intl";
import { MathText } from "@/components/ui/MathText";
import {
  getOrderTaskAction,
  submitOrderTaskAction,
} from "@/modules/stage2/actions";
import type { OrderTaskPresentation, OrderTaskReveal, OrderStep } from "@/modules/stage2/orderTask";
import { useStage2HintLadder } from "@/components/practice/useStage2HintLadder";
import css from "./OrderTaskCard.module.css";

/** Deterministic-per-load shuffle (Fisher-Yates via a simple seeded PRNG isn't
 * needed here — a plain `Math.random` shuffle is fine since the server never
 * sends an order to begin with, only stable step ids; re-shuffling on every
 * mount is an acceptable, non-security-relevant cosmetic difference). */
function shuffleForDisplay<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function OrderTaskCard({ taskId, roundId, diagnostic = false, quiet = false, submitLabel, onAnswered }: { taskId: number; roundId?: number; diagnostic?: boolean; quiet?: boolean; submitLabel?: string; onAnswered?: () => void }) {
  const t = useTranslations("Stage2");
  const [task, setTask] = useState<OrderTaskPresentation | null>(null);
  const [displaySteps, setDisplaySteps] = useState<OrderStep[]>([]);
  const [order, setOrder] = useState<number[]>([]);
  const [result, setResult] = useState<
    { correct: boolean; firstAttempt: boolean; retryAvailable?: true; revealed?: OrderTaskReveal } | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hints = useStage2HintLadder("order", taskId, roundId);

  useEffect(() => {
    let cancelled = false;
    getOrderTaskAction(taskId, undefined, roundId).then((state) => {
      if (cancelled) return;
      if (state.status === "success") {
        setTask(state.task);
        setDisplaySteps(shuffleForDisplay(state.task.steps));
        // Reconstruct exactly the same state a reload / second device would
        // have seen after the last submit — never fabricated client-side.
        const prior = state.task.priorResult;
        if (prior?.status === "correct") {
          setResult({ correct: true, firstAttempt: false });
        } else if (prior?.status === "locked") {
          setResult({ correct: false, firstAttempt: false, revealed: prior.revealed });
        } else if (prior?.status === "retry_available") {
          setResult({ correct: false, firstAttempt: true, retryAvailable: true });
          if (prior.submittedOrder) setOrder(prior.submittedOrder);
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

  function toggleStep(id: number) {
    if (isLocked || checking) return;
    setOrder((prev) => {
      if (prev[prev.length - 1] === id) return prev.slice(0, -1);
      if (prev.includes(id)) return prev;
      return [...prev, id];
    });
  }

  async function handleCheck() {
    if (checking || isLocked || order.length !== (task?.steps.length ?? 0)) return;
    setChecking(true);
    setError(null);
    try {
      const state = await submitOrderTaskAction({ taskId, roundId, expectedAttempt: result?.retryAvailable ? 2 : 1, submittedOrder: order });
      if (state.status === "success") {
        setResult(state);
        onAnswered?.();
      } else {
        setError(t("checkError"));
      }
    } finally {
      setChecking(false);
    }
  }

  function handleRetry() {
    setOrder([]);
  }

  return (
    <div className={css.wrap}>
      <h3>{task.name}</h3>
      <MathText text={task.taskText} />
      <p className={css.help}>{t("orderHelp")}</p>
      <div className={css.list} role="group" aria-label={t("orderHelp")}>
        {displaySteps.map((step) => {
          const position = order.indexOf(step.id);
          const picked = position >= 0;
          const expectedOrd = revealed?.correctOrder.indexOf(step.id) ?? -1;
          const ok = revealed && picked && position === expectedOrd;
          const bad = revealed && picked && position !== expectedOrd;
          return (
            <button
              key={step.id}
              type="button"
              disabled={isLocked || checking}
              className={clsx(css.step, picked && css.picked, ok && css.ok, bad && css.bad)}
              onClick={() => toggleStep(step.id)}
              aria-pressed={picked}
            >
              <span className={css.num} aria-hidden="true">
                {picked ? position + 1 : "·"}
              </span>
              <span className={css.stepText}>
                <MathText text={step.text} />
              </span>
            </button>
          );
        })}
      </div>

      {result && !quiet ? (
        <p className={css.statusText} role="status">
          {diagnostic ? t("answerSaved") : result.correct
            ? t("correct")
            : result.retryAvailable
              ? t("retryPrompt")
              : t("incorrectLocked")}
        </p>
      ) : null}

      {result?.retryAvailable && !quiet ? (
        <div className={css.hintPanel}>
          {hints.rungs.map((rung) => (
            <p key={rung.level} className={css.hintText}>
              <MathText text={rung.text} />
            </p>
          ))}
          {!hints.isFinal ? (
            <button
              type="button"
              className={css.hintButton}
              onClick={() => void hints.requestNext()}
              disabled={hints.loading}
            >
              {hints.loading ? t("hintLoading") : hints.rungs.length > 0 ? t("showNextHint") : t("showHint")}
            </button>
          ) : null}
        </div>
      ) : null}

      {revealed?.explanation && !quiet ? <MathText text={revealed.explanation} /> : null}

      {error ? <p role="alert">{error}</p> : null}

      {!isLocked ? (
        <button
          type="button"
          className={css.checkButton}
          onClick={handleCheck}
          disabled={checking || order.length !== task.steps.length}
        >
          {checking ? t("checking") : submitLabel ?? t("check")}
        </button>
      ) : null}

      {result?.retryAvailable && !quiet ? (
        <button type="button" className={css.resetButton} onClick={handleRetry}>
          {t("resetOrder")}
        </button>
      ) : null}
    </div>
  );
}
