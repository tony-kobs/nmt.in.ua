"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";
import { useTranslations } from "next-intl";
import { MathText } from "@/components/ui/MathText";
import { TestTaskCard } from "@/components/testing/TestTaskCard";
import { parseMathText } from "@/components/ui/MathText/parseMathText";
import { getBlankTaskAction, submitBlankTaskAction } from "@/modules/stage2/actions";
import type { BlankReveal, BlankTaskPresentation } from "@/modules/stage2/blankTask";
import { Stage2Hints } from "../Stage2Hints";
import css from "./BlankTaskCard.module.css";

type BlankBit = { kind: "text"; value: string } | { kind: "blank"; ord: number };

function normalizePlaceholders(text: string): string {
  return text.replace(/\\{\\{(\d+)\\}\\}/g, "{{$1}}");
}

function splitPlaceholders(text: string): BlankBit[] {
  const bits: BlankBit[] = [];
  const pattern = /\{\{(\d+)\}\}/g;
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > last) bits.push({ kind: "text", value: text.slice(last, index) });
    bits.push({ kind: "blank", ord: Number(match[1]) });
    last = index + match[0].length;
  }
  if (last < text.length) bits.push({ kind: "text", value: text.slice(last) });
  return bits;
}

export function BlankTaskCard({ taskId, roundId, diagnostic = false, quiet = false, submitLabel, onAnswered }: { taskId: number; roundId?: number; diagnostic?: boolean; quiet?: boolean; submitLabel?: string; onAnswered?: () => void }) {
  const t = useTranslations("Stage2");
  const [task, setTask] = useState<BlankTaskPresentation | null>(null);
  const [values, setValues] = useState<Record<number, string>>({});
  const [result, setResult] = useState<
    | { correct: boolean; retryAvailable?: true; revealed?: BlankReveal; perBlank: Record<number, boolean> }
    | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getBlankTaskAction(taskId, undefined, roundId).then((state) => {
      if (cancelled) return;
      if (state.status === "success") {
        setTask(state.task);
        const prior = state.task.priorResult;
        if (prior?.status === "correct") {
          setResult({ correct: true, perBlank: prior.perBlank });
        } else if (prior?.status === "locked") {
          setResult({ correct: false, revealed: prior.revealed, perBlank: prior.perBlank });
        } else if (prior?.status === "retry_available") {
          setResult({ correct: false, retryAvailable: true, perBlank: prior.perBlank });
          if (prior.submitted) setValues(prior.submitted);
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

  const isLocked = result !== null && !result.retryAvailable;
  const ready = task.blankOrds.every((ord) => (values[ord] ?? "").trim() !== "");

  async function handleCheck() {
    if (checking || isLocked || !ready) return;
    setChecking(true);
    setError(null);
    try {
      const state = await submitBlankTaskAction({ taskId, roundId, expectedAttempt: result?.retryAvailable ? 2 : 1, submitted: values });
      if (state.status === "success") { setResult(state); onAnswered?.(); }
      else setError(t("checkError"));
    } finally {
      setChecking(false);
    }
  }

  const lines = normalizePlaceholders(task.taskText)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  function blankField(ord: number, key: string) {
    const isOk = result?.perBlank[ord] === true;
    const isBad = result != null && result.perBlank[ord] === false;
    const showMark = result != null && !quiet;
    return (
      <label key={key} className={css.field}>
        <input
          className={clsx(css.input, showMark && isOk && css.inputOk, showMark && isBad && css.inputBad)}
          value={values[ord] ?? ""}
          disabled={isLocked}
          onChange={(event) => setValues((prev) => ({ ...prev, [ord]: event.target.value }))}
          autoComplete="off"
          inputMode="text"
          aria-label={t("blankLabel", { ord })}
        />
        {showMark ? (
          <span className={css.blankStatus}>
            {isOk ? t("correct") : result?.revealed?.correctByOrd[ord]}
          </span>
        ) : null}
      </label>
    );
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
    <form
      className={css.form}
      onSubmit={(event) => {
        event.preventDefault();
        void handleCheck();
      }}
    >
      <TestTaskCard
        heading="h3"
        title={<MathText text={task.name} />}
        prompt={<div className={css.sentence}>
          {lines.map((line, lineIndex) => {
            const parts = parseMathText(line);
            return (
              <div key={lineIndex} className={css.equation}>
                {parts.map((part, index) => {
                  const bits = splitPlaceholders(part.content);
                  const hasBlank = bits.some((bit) => bit.kind === "blank");
                  if (part.type === "formula" && !hasBlank) {
                    const wrapped = part.displayMode ? `$$${part.content}$$` : `$${part.content}$`;
                    return <MathText key={index} text={wrapped} />;
                  }
                  return (
                    <span key={index} className={css.chunk}>
                      {bits.map((bit, bitIndex) => {
                        if (bit.kind === "blank") return blankField(bit.ord, `${lineIndex}-${index}-${bitIndex}`);
                        const value = bit.value.trim();
                        if (!value) return null;
                        return (
                          <MathText
                            key={`${index}-${bitIndex}`}
                            text={part.type === "formula" ? `$${bit.value}$` : bit.value}
                          />
                        );
                      })}
                    </span>
                  );
                })}
              </div>
            );
          })}
        </div>}
        hint={
          note || (result?.revealed?.explanation && !quiet) ? (
            <>
              {note ? <span role="status">{note}</span> : null}
              {result?.revealed?.explanation && !quiet ? (
                <MathText text={result.revealed.explanation} />
              ) : null}
            </>
          ) : undefined
        }
        result={!quiet && result?.correct && !diagnostic ? t("correct") : undefined}
      >
        {result?.retryAvailable && !diagnostic && !quiet ? <Stage2Hints format="blank" taskId={taskId} roundId={roundId} /> : null}
        {error ? <p role="alert">{error}</p> : null}

        {!isLocked ? (
          <button type="submit" className={css.checkButton} disabled={checking || !ready}>
            {checking ? t("checking") : submitLabel ?? t("check")}
          </button>
        ) : null}
      </TestTaskCard>
    </form>
  );
}
