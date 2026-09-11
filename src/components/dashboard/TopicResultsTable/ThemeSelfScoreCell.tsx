"use client";

import { useEffect, useState, useTransition } from "react";
import clsx from "clsx";
import { saveThemeSelfScoreAction } from "@/modules/self-score/actions";
import css from "./TopicResultsTable.module.css";

const SCORES = [1, 2, 3, 4, 5] as const;

export type ThemeSelfScoreCellLabels = {
  aria: string;
  errorGeneric: string;
};

type ThemeSelfScoreCellProps = {
  themeId: number;
  value: number | null;
  labels: ThemeSelfScoreCellLabels;
};

function toSelectableScore(value: number | null): number | null {
  if (value == null) return null;
  if (value >= 1 && value <= 5) return value;
  return null;
}

export function ThemeSelfScoreCell({
  themeId,
  value,
  labels,
}: ThemeSelfScoreCellProps) {
  const [score, setScore] = useState<number | null>(() =>
    toSelectableScore(value),
  );
  const [error, setError] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setScore(toSelectableScore(value));
  }, [value]);

  function onChange(nextRaw: string) {
    const next = Number(nextRaw);
    if (!Number.isInteger(next) || next < 1 || next > 5) return;
    if (next === score) return;

    const previous = score;
    setScore(next);
    setError(false);

    startTransition(async () => {
      const result = await saveThemeSelfScoreAction({
        themeId,
        score: next,
      });
      if (result.status === "success") {
        setScore(result.score);
        return;
      }
      setScore(previous);
      setError(true);
    });
  }

  return (
    <div className={css.selfScoreCell}>
      <label className={css.visuallyHidden} htmlFor={`self-score-${themeId}`}>
        {labels.aria}
      </label>
      <select
        id={`self-score-${themeId}`}
        className={clsx(css.selfScoreSelect, score == null && css.selfScoreEmpty)}
        value={score ?? ""}
        disabled={pending}
        aria-busy={pending}
        aria-invalid={error}
        title={error ? labels.errorGeneric : undefined}
        onChange={(event) => onChange(event.currentTarget.value)}
      >
        <option value="" disabled>
          —
        </option>
        {SCORES.map((n) => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>
    </div>
  );
}
