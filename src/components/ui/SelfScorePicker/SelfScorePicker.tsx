"use client";

import { ModeTabs } from "@/components/ui/ModeTabs";
import css from "./SelfScorePicker.module.css";

const SCORE_IDS = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
] as const;
type ScoreId = (typeof SCORE_IDS)[number];
type ScoreTab = ScoreId | "none";

type SelfScorePickerProps = {
  value: number | null;
  onChange: (score: number) => void;
  ariaLabel: string;
  disabled?: boolean;
};

/**
 * A 1-10 pill grid for self-assessment (min 44px touch targets, no slider).
 * Reuses the shared `ModeTabs` control — the same pattern already shipped
 * for the site-feedback score in FeedbackDialog.
 */
export function SelfScorePicker({
  value,
  onChange,
  ariaLabel,
  disabled = false,
}: SelfScorePickerProps) {
  const tabValue: ScoreTab = value === null ? "none" : (String(value) as ScoreId);

  return (
    <div className={css.scoreWrap}>
      <ModeTabs<ScoreTab>
        value={tabValue}
        onChange={(next) => {
          if (next === "none") return;
          onChange(Number(next));
        }}
        options={SCORE_IDS.map((id) => ({ id, label: id }))}
        ariaLabel={ariaLabel}
        disabled={disabled}
      />
    </div>
  );
}
