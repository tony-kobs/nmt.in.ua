"use client";

import clsx from "clsx";
import {
  formatDurationSeconds,
  formatTimePerTask,
  type LearningSessionRow,
} from "@/modules/sessions/types";
import {
  formatPercent as formatResultPercent,
  getScoreLevel,
} from "@/modules/results/types";
import { useLocale, useTranslations } from "next-intl";
import { SessionActions } from "./LearningSessionActions";
import { SessionStatusBlock } from "./LearningSessionStatus";
import css from "./LearningSessionsTable.module.css";

function formatPercent(percent: number | null): string {
  if (percent === null) return "—";
  return formatResultPercent(percent);
}

function percentScoreClass(percent: number | null): string {
  switch (getScoreLevel(percent)) {
    case "high":
      return css.scoreHigh;
    case "medium":
      return css.scoreMedium;
    case "low":
      return css.scoreLow;
    default:
      return css.scoreNone;
  }
}

type LearningSessionCardProps = {
  row: LearningSessionRow;
  extended: boolean;
  readOnly: boolean;
};

export function LearningSessionCard({
  row,
  extended,
  readOnly,
}: LearningSessionCardProps) {
  const t = useTranslations("LearningSessionsTable");
  const locale = useLocale();

  return (
    <article className={css.card}>
      <div className={css.cardTop}>
        <div className={css.cardTitleBlock}>
          <span className={css.cardIndex}>#{row.rowNumber}</span>
          <p className={css.cardTheme}>{row.themeName}</p>
        </div>
        <span className={clsx(css.score, percentScoreClass(row.percent))}>
          {formatPercent(row.percent)}
        </span>
      </div>

      <dl className={css.meta}>
        <div>
          <dt>{t("difficulty")}</dt>
          <dd>{row.difficulty ?? "—"}</dd>
        </div>
        <div>
          <dt>{t("timePerTest")}</dt>
          <dd>{formatTimePerTask(row.timePerTaskSec)}</dd>
        </div>
        {extended ? (
          <>
            <div>
              <dt>{t("tasks")}</dt>
              <dd>{row.tasksNumber}</dd>
            </div>
            <div>
              <dt>{t("correct")}</dt>
              <dd>{row.rightNumber}</dd>
            </div>
            <div>
              <dt>{t("timeSeconds")}</dt>
              <dd>{formatDurationSeconds(row.timeSec, locale)}</dd>
            </div>
            <div>
              <dt>{t("startDate")}</dt>
              <dd>{row.startTimeLabel}</dd>
            </div>
            <div className={css.metaWide}>
              <dt>{t("createdBy")}</dt>
              <dd>{t(`createdByValues.${row.createdBy}`)}</dd>
            </div>
          </>
        ) : null}
      </dl>

      <div className={css.cardFoot}>
        <SessionStatusBlock row={row} />
        {readOnly ? null : <SessionActions row={row} />}
      </div>
    </article>
  );
}
