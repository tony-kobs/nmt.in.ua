"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import clsx from "clsx";
import { useTranslations } from "next-intl";
import { MathText } from "@/components/ui/MathText";
import { getMatchingTaskAction, submitMatchingTaskAction } from "@/modules/stage2/actions";
import type { MatchingReveal, MatchingTaskPresentation } from "@/modules/stage2/matchingTask";
import { Stage2Hints } from "../Stage2Hints";
import css from "./MatchingTaskCard.module.css";

function shuffle<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function nextIndex(current: number, delta: number, length: number): number {
  if (length <= 0) return 0;
  return (current + delta + length) % length;
}

export function MatchingTaskCard({ taskId, roundId, diagnostic = false, quiet = false, submitLabel, onAnswered }: { taskId: number; roundId?: number; diagnostic?: boolean; quiet?: boolean; submitLabel?: string; onAnswered?: () => void }) {
  const t = useTranslations("Stage2");
  const [task, setTask] = useState<MatchingTaskPresentation | null>(null);
  const [rightOrder, setRightOrder] = useState<{ id: number; text: string }[]>([]);
  const [pairs, setPairs] = useState<Record<number, number>>({});
  const [activeLeft, setActiveLeft] = useState<number | null>(null);
  const [result, setResult] = useState<
    { correct: boolean; retryAvailable?: true; revealed?: MatchingReveal } | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const leftRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const rightRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const pendingRightFocus = useRef(false);

  useEffect(() => {
    if (!pendingRightFocus.current || activeLeft == null) return;
    pendingRightFocus.current = false;
    const node = rightRefs.current.find((button) => button && !button.disabled);
    node?.focus();
  }, [activeLeft]);

  useEffect(() => {
    let cancelled = false;
    getMatchingTaskAction(taskId, undefined, roundId).then((state) => {
      if (cancelled) return;
      if (state.status === "success") {
        setTask(state.task);
        setRightOrder(shuffle(state.task.rightItems));
        const prior = state.task.priorResult;
        if (prior?.status === "correct") {
          setResult({ correct: true });
        } else if (prior?.status === "locked") {
          setResult({ correct: false, revealed: prior.revealed });
        } else if (prior?.status === "retry_available") {
          setResult({ correct: false, retryAvailable: true });
          if (prior.submittedPairs) setPairs(prior.submittedPairs);
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

  const takenRightIds = useMemo(() => new Set(Object.values(pairs)), [pairs]);

  if (loading) return <p role="status">{t("loading")}</p>;
  if (!task) return <p role="alert">{error ?? t("loadError")}</p>;

  const leftItems = task.leftItems;
  const revealed = result?.revealed ?? null;
  const isLocked = result !== null && !result.retryAvailable;
  const complete = leftItems.every((item) => pairs[item.id] !== undefined);
  const leftFocusIndex = Math.max(
    0,
    leftItems.findIndex((item) => item.id === activeLeft),
  );

  function pickLeft(id: number) {
    if (isLocked) return;
    setActiveLeft(id);
  }

  function pickRight(id: number) {
    if (isLocked || activeLeft == null) return;
    setPairs((prev) => ({ ...prev, [activeLeft]: id }));
    setActiveLeft(null);
  }

  function focusFirstRight() {
    const node = rightRefs.current.find((button) => button && !button.disabled);
    node?.focus();
  }

  function onLeftKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (isLocked) return;
    const fromEvent = leftRefs.current.findIndex((node) => node === event.target);
    const current = fromEvent >= 0 ? fromEvent : leftFocusIndex;
    const last = leftItems.length - 1;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      const next = nextIndex(current, 1, leftItems.length);
      pickLeft(leftItems[next]!.id);
      leftRefs.current[next]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      const next = nextIndex(current, -1, leftItems.length);
      pickLeft(leftItems[next]!.id);
      leftRefs.current[next]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      pickLeft(leftItems[0]!.id);
      leftRefs.current[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      pickLeft(leftItems[last]!.id);
      leftRefs.current[last]?.focus();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      const currentItem = leftItems[current];
      if (currentItem && activeLeft == null) pickLeft(currentItem.id);
      pendingRightFocus.current = true;
      if (activeLeft != null) focusFirstRight();
    }
  }

  function onRightKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (isLocked || activeLeft == null) return;
    const buttons = rightRefs.current;
    const fromEvent = buttons.findIndex((node) => node === event.target);
    const current = fromEvent >= 0 ? fromEvent : 0;

    function move(delta: number) {
      const length = rightOrder.length;
      let index = current;
      for (let step = 0; step < length; step += 1) {
        index = nextIndex(index, delta, length);
        const node = buttons[index];
        if (node && !node.disabled) {
          node.focus();
          return;
        }
      }
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      move(1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      move(-1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusFirstRight();
    } else if (event.key === "End") {
      event.preventDefault();
      for (let index = rightOrder.length - 1; index >= 0; index -= 1) {
        const node = buttons[index];
        if (node && !node.disabled) {
          node.focus();
          return;
        }
      }
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      leftRefs.current[leftFocusIndex]?.focus();
    }
  }

  async function handleCheck() {
    if (checking || isLocked || !complete) return;
    setChecking(true);
    setError(null);
    try {
      const state = await submitMatchingTaskAction({ taskId, roundId, expectedAttempt: result?.retryAvailable ? 2 : 1, submittedPairs: pairs });
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

      <div className={css.columns}>
        <div
          className={css.col}
          role="listbox"
          aria-label={t("matchingLeftLabel")}
          onKeyDown={onLeftKeyDown}
        >
          {leftItems.map((item, index) => {
            const chosenId = pairs[item.id];
            const chosen = rightOrder.find((r) => r.id === chosenId);
            const ok = revealed && chosenId === revealed.correctPairs[item.id];
            const bad = revealed && chosenId != null && chosenId !== revealed.correctPairs[item.id];
            const tabbable = !isLocked && (activeLeft === item.id || (activeLeft == null && index === 0));
            return (
              <button
                key={item.id}
                ref={(node) => {
                  leftRefs.current[index] = node;
                }}
                type="button"
                role="option"
                aria-selected={activeLeft === item.id}
                tabIndex={tabbable ? 0 : -1}
                disabled={isLocked}
                className={clsx(css.row, activeLeft === item.id && css.active, ok && css.matched, bad && css.wrongMatch)}
                onClick={() => pickLeft(item.id)}
              >
                <MathText text={item.text} />
                <span className={css.chip}>{chosen ? chosen.text : t("matchingUnpaired")}</span>
              </button>
            );
          })}
        </div>
        <div
          className={css.col}
          role="listbox"
          aria-label={t("matchingRightLabel")}
          onKeyDown={onRightKeyDown}
        >
          {rightOrder.map((item, index) => {
            const taken = takenRightIds.has(item.id);
            const disabled = isLocked || activeLeft == null;
            const tabbable = !disabled && index === 0;
            return (
              <button
                key={item.id}
                ref={(node) => {
                  rightRefs.current[index] = node;
                }}
                type="button"
                role="option"
                aria-selected={false}
                tabIndex={tabbable ? 0 : -1}
                disabled={disabled}
                className={clsx(css.row, taken && css.taken)}
                onClick={() => pickRight(item.id)}
              >
                <MathText text={item.text} />
              </button>
            );
          })}
        </div>
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
      {result?.retryAvailable && !diagnostic && !quiet ? <Stage2Hints format="matching" taskId={taskId} roundId={roundId} /> : null}
      {error ? <p role="alert">{error}</p> : null}

      {!isLocked ? (
        <button type="button" className={css.checkButton} onClick={handleCheck} disabled={checking || !complete}>
          {checking ? t("checking") : submitLabel ?? t("check")}
        </button>
      ) : null}
    </div>
  );
}
