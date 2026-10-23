"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { useTranslations } from "next-intl";
import { MathText } from "@/components/ui/MathText";
import { TestTaskCard } from "@/components/testing/TestTaskCard";
import { getGraphTaskAction, submitGraphTaskAction } from "@/modules/stage2/actions";
import type { GraphTaskPresentation, GraphTaskReveal } from "@/modules/stage2/graphTask";
import { Stage2Hints } from "../Stage2Hints";
import css from "./GraphTaskCard.module.css";

const SIZE = 100;
const PAD = 12;

function toPlot(value: number, min: number, max: number): number {
  if (max === min) return SIZE / 2;
  return PAD + ((value - min) / (max - min)) * (SIZE - PAD * 2);
}

function axisTicks(min: number, max: number): number[] {
  const ticks: number[] = [];
  const span = max - min;
  const step = span > 16 ? 2 : 1;
  for (let n = Math.ceil(min / step) * step; n <= max; n += step) ticks.push(n);
  return ticks;
}

/** Points on the plot are the buttons. The grid is decorative. The label and aria-pressed carry the state; color only reinforces it. */
export function GraphTaskCard({ taskId, roundId, diagnostic = false, quiet = false, submitLabel, onAnswered }: { taskId: number; roundId?: number; diagnostic?: boolean; quiet?: boolean; submitLabel?: string; onAnswered?: () => void }) {
  const t = useTranslations("Stage2");
  const [task, setTask] = useState<GraphTaskPresentation | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [result, setResult] = useState<
    { correct: boolean; retryAvailable?: true; revealed?: GraphTaskReveal } | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getGraphTaskAction(taskId, undefined, roundId).then((state) => {
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
          if (prior.submittedPointIds) setSelected(new Set(prior.submittedPointIds));
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
  const correctSet = new Set(revealed?.correctPointIds ?? []);

  function toggle(id: number) {
    if (isLocked || checking) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleCheck() {
    if (checking || isLocked) return;
    setChecking(true);
    setError(null);
    try {
      const state = await submitGraphTaskAction({
        taskId,
        roundId,
        expectedAttempt: result?.retryAvailable ? 2 : 1,
        submittedPointIds: [...selected],
      });
      if (state.status === "success") { setResult(state); onAnswered?.(); }
      else setError(t("checkError"));
    } finally {
      setChecking(false);
    }
  }

  const min = Number(task.axisMin);
  const max = Number(task.axisMax);
  const numberLine = task.points.length > 0 && task.points.every((point) => Number(point.y) === Number(task.points[0]?.y));
  const zeroInside = min <= 0 && max >= 0;

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

      <p className={css.graphHelp}>{t("graphClick")}</p>
      <div className={css.plotScroll}>
      <div className={numberLine ? css.plotLine : css.plot}>
        <svg viewBox={`0 0 ${SIZE} ${numberLine ? 42 : SIZE}`} className={css.svg} preserveAspectRatio="none" aria-hidden="true">
          {numberLine ? (
            <line x1={PAD} y1={21} x2={SIZE - PAD} y2={21} className={css.axis} />
          ) : (
            axisTicks(min, max).map((tick) => {
              const x = toPlot(tick, min, max);
              const y = SIZE - toPlot(tick, min, max);
              return (
                <g key={tick}>
                  <line x1={x} y1={PAD} x2={x} y2={SIZE - PAD} className={css.grid} />
                  <line x1={PAD} y1={y} x2={SIZE - PAD} y2={y} className={css.grid} />
                </g>
              );
            })
          )}
          {!numberLine && zeroInside ? (
            <>
              <line x1={PAD} y1={SIZE - toPlot(0, min, max)} x2={SIZE - PAD} y2={SIZE - toPlot(0, min, max)} className={css.axis} />
              <line x1={toPlot(0, min, max)} y1={PAD} x2={toPlot(0, min, max)} y2={SIZE - PAD} className={css.axis} />
            </>
          ) : null}
          {numberLine
            ? axisTicks(min, max).map((tick) => (
                <line key={tick} x1={toPlot(tick, min, max)} y1={18} x2={toPlot(tick, min, max)} y2={24} className={css.axis} />
              ))
            : null}
        </svg>
        <div className={css.hits} role="group" aria-label={t("graphPointsLabel")}>
          {task.points.map((p) => {
            const x = Number(p.x);
            const y = Number(p.y);
            const isSelected = selected.has(p.id);
            const isCorrect = revealed && correctSet.has(p.id);
            const isWrong = revealed && isSelected && !correctSet.has(p.id);
            const top = numberLine ? 50 : SIZE - toPlot(y, min, max);
            const labelBelow = !numberLine && top < 18;
            return (
              <button
                key={p.id}
                type="button"
                disabled={isLocked || checking}
                className={clsx(
                  css.hit,
                  isSelected && css.hitSelected,
                  isCorrect && css.hitCorrect,
                  isWrong && css.hitWrong,
                )}
                style={{ left: `${toPlot(x, min, max)}%`, top: `${top}%` }}
                onClick={() => toggle(p.id)}
                aria-pressed={isSelected}
                aria-label={`${p.label} (${x}; ${y})`}
              >
                <span className={css.hitDot} aria-hidden="true" />
                <span className={labelBelow ? css.hitLabelBelow : css.hitLabel}>{p.label}</span>
                {isSelected ? <span className={css.srOnly}>{t("selectedBadge")}</span> : null}
              </button>
            );
          })}
        </div>
      </div>
      </div>

      {result?.retryAvailable && !diagnostic && !quiet ? <Stage2Hints format="graph" taskId={taskId} roundId={roundId} /> : null}
      {error ? <p role="alert">{error}</p> : null}

      {!isLocked ? (
        <button type="button" className={css.checkButton} onClick={handleCheck} disabled={checking}>
          {checking ? t("checking") : submitLabel ?? t("check")}
        </button>
      ) : null}
    </TestTaskCard>
  );
}
