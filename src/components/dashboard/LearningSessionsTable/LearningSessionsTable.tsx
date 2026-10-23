"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import type { LearningSessionRow } from "@/modules/sessions/types";
import {
  formatDurationSeconds,
  formatTimePerTask,
} from "@/modules/sessions/types";
import { formatPercent as formatResultPercent } from "@/modules/results/types";
import { useLocale, useTranslations } from "next-intl";
import { Pagination } from "@/components/ui/Pagination";
import { paginateSlice } from "@/lib/pagination";
import { queryHref } from "@/lib/queryHref";
import { LearningSessionsMobileSwiper } from "./LearningSessionsMobileSwiper";
import { SessionActions } from "./LearningSessionActions";
import { SessionStatusBlock } from "./LearningSessionStatus";
import css from "./LearningSessionsTable.module.css";

type LearningSessionsTableProps = {
  rows: LearningSessionRow[];
  extended?: boolean;
  /** Hide start/cancel — for teacher viewing a student's sessions. */
  readOnly?: boolean;
  title?: string;
  lead?: string;
  empty?: string;
  /** Kept when toggling compact/extended (e.g. `student`). */
  queryParams?: Record<string, string | null | undefined>;
  page?: number;
  pathname?: string;
};

function formatPercent(percent: number | null): string {
  if (percent === null) return "—";
  return formatResultPercent(percent);
}

export function LearningSessionsTable({
  rows,
  extended = false,
  readOnly = false,
  title,
  lead,
  empty,
  queryParams,
  page = 1,
  pathname = "/sessions",
}: LearningSessionsTableProps) {
  const t = useTranslations("LearningSessionsTable");
  const locale = useLocale();
  const router = useRouter();
  const showExtendedInfo = extended;
  const paginated = useMemo(() => paginateSlice(rows, page), [rows, page]);
  const displayRows = useMemo(
    () =>
      paginated.items.map((row, index) => ({
        ...row,
        rowNumber: (paginated.page - 1) * paginated.pageSize + index + 1,
      })),
    [paginated],
  );
  const mobileRows = useMemo(
    () =>
      rows.map((row, index) => ({
        ...row,
        rowNumber: index + 1,
      })),
    [rows],
  );
  const pagerQuery = {
    ...queryParams,
    extended: extended ? "1" : null,
  };
  const listLabel = showExtendedInfo
    ? t("tableAriaExtended")
    : t("tableAria");

  return (
    <section
      className={css.learningSessions}
      aria-labelledby="learning-sessions-title"
    >
      <header className={css.intro}>
        <h1 id="learning-sessions-title" className={css.title}>
          {title ?? t("title")}
        </h1>
        <div className={css.descriptionRow}>
          <p className={css.lead}>{lead ?? t("lead")}</p>
          {rows.length > 0 && !readOnly ? (
            <div className={css.tableControls}>
              <button
                type="button"
                className={css.detailsToggle}
                aria-expanded={showExtendedInfo}
                aria-controls="learning-sessions-cards learning-sessions-table"
                onClick={() =>
                  router.replace(
                    queryHref(pathname, {
                      ...pagerQuery,
                      extended: showExtendedInfo ? null : "1",
                      page: paginated.page > 1 ? String(paginated.page) : null,
                    }),
                    { scroll: false },
                  )
                }
              >
                {showExtendedInfo ? t("compactInfo") : t("extendedInfo")}
              </button>
            </div>
          ) : null}
        </div>
      </header>

      {rows.length === 0 ? (
        <p className={css.empty} role="status">
          {empty ?? t("empty")}
        </p>
      ) : (
        <>
          <LearningSessionsMobileSwiper
            rows={mobileRows}
            extended={showExtendedInfo}
            readOnly={readOnly}
            listLabel={listLabel}
          />

          <div
            id="learning-sessions-table"
            className={css.tableWrap}
            aria-label={listLabel}
          >
            <table
              className={clsx(css.table, showExtendedInfo && css.tableExpanded)}
            >
              <thead>
                <tr>
                  <th scope="col" className={css.colIndex}>#</th>
                  <th scope="col" className={css.colTheme}>{t("theme")}</th>
                  <th scope="col" className={css.colDifficulty}>
                    {t("difficulty")}
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
                  <th scope="col" className={css.colNarrow}>%</th>
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
                  <th scope="col" className={css.colStatus}>{t("status")}</th>
                  {readOnly ? null : (
                    <th scope="col" className={css.colActions}>
                      {t("actions")}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {displayRows.map((row) => (
                  <tr key={row.id}>
                    <td className={css.colIndex}>{row.rowNumber}</td>
                    <td className={css.colTheme}>{row.themeName}</td>
                    <td className={css.colDifficulty}>
                      {row.difficulty ?? "—"}
                    </td>
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
                        {formatDurationSeconds(row.timeSec, locale)}
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
                      <SessionStatusBlock row={row} />
                    </td>
                    {readOnly ? null : (
                      <td className={css.colActions}>
                        <SessionActions row={row} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {rows.length > 0 ? (
        <div className={css.desktopPager}>
          <Pagination
            pathname={pathname}
            page={paginated.page}
            totalPages={paginated.totalPages}
            total={paginated.total}
            queryParams={pagerQuery}
          />
        </div>
      ) : null}

      <p className={css.hint}>{t("hint")}</p>
    </section>
  );
}
