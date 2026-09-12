"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import clsx from "clsx";
import {
  cancelLearningSessionAction,
  type CancelLearningSessionActionState,
} from "@/modules/sessions/actions";
import type { LearningSessionRow } from "@/modules/sessions/types";
import {
  formatDurationSeconds,
  formatTimePerTask,
} from "@/modules/sessions/types";
import { useTranslations } from "next-intl";
import css from "./LearningSessionsTable.module.css";

const CANCEL_INITIAL: CancelLearningSessionActionState = { status: "idle" };

type LearningSessionsTableProps = {
  rows: LearningSessionRow[];
};

function formatPercent(percent: number | null): string {
  if (percent === null) return "—";
  return `${Math.round(percent)}%`;
}

function statusClass(status: LearningSessionRow["status"]): string {
  if (status === "completed") return css.statusCompleted;
  if (status === "expired") return css.statusExpired;
  return css.statusPlanned;
}

function SessionActions({ row }: { row: LearningSessionRow }) {
  const t = useTranslations("LearningSessionsTable");

  const [state, formAction, pending] = useActionState(
    cancelLearningSessionAction,
    CANCEL_INITIAL,
  );

  if (row.status === "completed") {
    return null;
  }

  return (
    <div className={css.actions}>

      {state.status === "error" ? (
        <span className={css.error} role="alert">
          {t(`errors.${state.code}`)}
        </span>
      ) : null}
    </div>
  );
}

export function LearningSessionsTable({ rows }: LearningSessionsTableProps) {
  const t = useTranslations("LearningSessionsTable");
  const [showExtendedInfo, setShowExtendedInfo] = useState(false);

  return (
    <section
      className={css.learningSessions}
      aria-labelledby="learning-sessions-title"
    >
      <header className={css.intro}>
        <h1 id="learning-sessions-title" className={css.title}>
          {t("title")}
        </h1>
        <div className={css.descriptionRow}>
          <p className={css.lead}>{t("lead")}</p>
          {rows.length > 0 ? (
            <div className={css.tableControls}>
              <button
                type="button"
                className={css.detailsToggle}
                aria-expanded={showExtendedInfo}
                aria-controls="learning-sessions-table"
                onClick={() => setShowExtendedInfo((current) => !current)}
              >
                {showExtendedInfo ? t("compactInfo") : t("extendedInfo")}
              </button>
            </div>
          ) : null}
        </div>
      </header>

      {rows.length === 0 ? (
        <p className={css.empty} role="status">
          {t("empty")}
        </p>
      ) : (
        <div
          id="learning-sessions-table"
          className={css.tableWrap}
          aria-label={
            showExtendedInfo ? t("tableAriaExtended") : t("tableAria")
          }
        >
          <table
            className={clsx(css.table, showExtendedInfo && css.tableExpanded)}
          >
            <thead>
              <tr>
                <th scope="col" className={css.colIndex}>
                  #
                </th>
                <th scope="col" className={css.colTheme}>
                  {t("theme")}
                </th>
                {showExtendedInfo ? (
                  <>
                    <th scope="col" className={css.colNarrow}>
                      {t("tasks")}
                    </th>
                    <th scope="col" className={css.colNarrow}>
                      {t("correct")}
                    </th>
                  </>
                ) : null}
                <th scope="col" className={css.colNarrow}>
                  %
                </th>
                {showExtendedInfo ? (
                  <th scope="col" className={css.colNarrow}>
                    {t("timeSeconds")}
                  </th>
                ) : null}
                <th scope="col" className={css.colTimePer}>
                  {t("timePerTest")}
                </th>
                {showExtendedInfo ? (
                  <>
                    <th scope="col" className={css.colDate}>
                      {t("startDate")}
                    </th>
                    <th scope="col" className={css.colCreatedBy}>
                      {t("createdBy")}
                    </th>
                  </>
                ) : null}
                <th scope="col" className={css.colStatus}>
                  {t("status")}
                </th>
                <th scope="col" className={css.colActions}>
                  {t("actions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className={css.colIndex}>{row.rowNumber}</td>
                  <td className={css.colTheme}>{row.themeName}</td>
                  {showExtendedInfo ? (
                    <>
                      <td className={css.colNarrow}>{row.tasksNumber}</td>
                      <td className={css.colNarrow}>{row.rightNumber}</td>
                    </>
                  ) : null}
                  <td className={css.colNarrow}>
                    {formatPercent(row.percent)}
                  </td>
                  {showExtendedInfo ? (
                    <td className={css.colNarrow}>
                      {formatDurationSeconds(row.timeSec)}
                    </td>
                  ) : null}
                  <td className={css.colTimePer}>
                    {formatTimePerTask(row.timePerTaskSec)}
                  </td>
                  {showExtendedInfo ? (
                    <>
                      <td className={css.colDate}>{row.startTimeLabel}</td>
                      <td className={css.colCreatedBy}>
                        {t(`createdByValues.${row.createdBy}`)}
                      </td>
                    </>
                  ) : null}
                  <td className={css.colStatus}>
                    <span className={clsx(statusClass(row.status))}>
                      {t(`statuses.${row.status}`)}
                    </span>
                  </td>
                  <td className={css.colActions}>
                    <SessionActions row={row} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className={css.hint}>{t("hint")}</p>
    </section>
  );
}
