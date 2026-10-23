"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import clsx from "clsx";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Pagination } from "@/components/ui/Pagination";
import { paginateSlice } from "@/lib/pagination";
import {
  popoverExit,
  popoverHidden,
  popoverShown,
  tweenFast,
} from "@/lib/motionPresets";
import { useIsClient } from "@/lib/useIsClient";
import type { TeacherLearningSessionRow } from "@/modules/sessions/teacherLearningSessions";
import {
  formatDurationSeconds,
  formatTimePerTask,
} from "@/modules/sessions/types";
import { formatPercent, getScoreLevel } from "@/modules/results/types";
import { queryHref } from "@/lib/queryHref";
import css from "./TeacherClassSessions.module.css";

type ColumnKey =
  | "student"
  | "theme"
  | "correct"
  | "percent"
  | "time"
  | "speed"
  | "when"
  | "createdBy"
  | "status";

type SortDir = "asc" | "desc";

type SortState = {
  key: ColumnKey;
  dir: SortDir;
};

type FilterState = Partial<Record<ColumnKey, Set<string>>>;

function useMinWidth(px: number): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${px}px)`);
    const sync = () => setMatches(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [px]);
  return matches;
}

function scoreClass(percent: number | null): string {
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

function statusClass(status: TeacherLearningSessionRow["status"]): string {
  if (status === "completed") return css.statusCompleted;
  if (status === "expired") return css.statusExpired;
  return css.statusPlanned;
}

function dateOnlyLabel(startTimeLabel: string): string {
  if (!startTimeLabel || startTimeLabel === "—") return "—";
  const comma = startTimeLabel.indexOf(",");
  if (comma >= 0) return startTimeLabel.slice(0, comma).trim();
  return startTimeLabel.replace(/\s+\d{1,2}:\d{2}.*$/, "").trim() || startTimeLabel;
}

function timeOnlyLabel(startTimeLabel: string): string | null {
  if (!startTimeLabel || startTimeLabel === "—") return null;
  const comma = startTimeLabel.indexOf(",");
  if (comma < 0) return null;
  return startTimeLabel.slice(comma + 1).trim() || null;
}

function DateCell({ label }: { label: string }) {
  const day = dateOnlyLabel(label);
  const time = timeOnlyLabel(label);
  return (
    <span className={css.dateStack}>
      <span className={css.dateDay}>{day}</span>
      {time ? <span className={css.dateTime}>{time}</span> : null}
    </span>
  );
}

function filterValue(
  row: TeacherLearningSessionRow,
  key: ColumnKey,
  labelCreated: (by: TeacherLearningSessionRow["createdBy"]) => string,
  labelStatus: (status: TeacherLearningSessionRow["status"]) => string,
  locale: string,
): string {
  switch (key) {
    case "student":
      return row.studentDisplayName;
    case "theme":
      return row.themeName;
    case "correct":
      return `${row.rightNumber}/${row.tasksNumber}`;
    case "percent":
      return formatPercent(row.percent);
    case "time":
      return formatDurationSeconds(row.timeSec, locale);
    case "speed":
      return formatTimePerTask(row.timePerTaskSec);
    case "when":
      return dateOnlyLabel(row.startTimeLabel);
    case "createdBy":
      return labelCreated(row.createdBy);
    case "status":
      return labelStatus(row.status);
  }
}

function compareRows(
  a: TeacherLearningSessionRow,
  b: TeacherLearningSessionRow,
  sort: SortState,
): number {
  const dir = sort.dir === "asc" ? 1 : -1;
  switch (sort.key) {
    case "student":
      return (
        a.studentDisplayName.localeCompare(b.studentDisplayName, "uk") * dir ||
        b.id - a.id
      );
    case "theme":
      return a.themeName.localeCompare(b.themeName, "uk") * dir || b.id - a.id;
    case "correct": {
      const ap = a.tasksNumber > 0 ? a.rightNumber / a.tasksNumber : -1;
      const bp = b.tasksNumber > 0 ? b.rightNumber / b.tasksNumber : -1;
      return (ap - bp) * dir || b.id - a.id;
    }
    case "percent": {
      const ap = a.percent ?? -1;
      const bp = b.percent ?? -1;
      return (ap - bp) * dir || b.id - a.id;
    }
    case "time":
      return (a.timeSec - b.timeSec) * dir || b.id - a.id;
    case "speed": {
      const as = a.timePerTaskSec ?? -1;
      const bs = b.timePerTaskSec ?? -1;
      return (as - bs) * dir || b.id - a.id;
    }
    case "when":
      return (a.id - b.id) * dir;
    case "createdBy":
      return a.createdBy.localeCompare(b.createdBy) * dir || b.id - a.id;
    case "status":
      return a.status.localeCompare(b.status) * dir || b.id - a.id;
  }
}

type HeaderProps = {
  column: ColumnKey;
  label: string;
  sort: SortState;
  onSort: (key: ColumnKey, dir: SortDir) => void;
  options: string[];
  selected: Set<string> | null;
  onFilterChange: (key: ColumnKey, next: Set<string> | null) => void;
  openColumn: ColumnKey | null;
  setOpenColumn: (key: ColumnKey | null) => void;
};

function ColumnHeader({
  column,
  label,
  sort,
  onSort,
  options,
  selected,
  onFilterChange,
  openColumn,
  setOpenColumn,
}: HeaderProps) {
  const t = useTranslations("TeacherStudentSessions");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const portalReady = useIsClient();
  const reduceMotion = useReducedMotion();
  const isOpen = openColumn === column;
  const isSorted = sort.key === column;
  const filtered = selected != null && selected.size < options.length;
  const active = selected ?? new Set(options);

  const [box, setBox] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const place = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const width = Math.min(280, Math.max(220, rect.width + 48));
    const left = Math.min(
      Math.max(8, rect.left),
      Math.max(8, window.innerWidth - width - 8),
    );
    setBox({ top: rect.bottom + 6, left, width });
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    place();
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpenColumn(null);
    };
    const onReposition = () => place();
    document.addEventListener("mousedown", onPointer);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
  }, [isOpen, place, setOpenColumn]);

  return (
    <div className={clsx(css.headInner, filtered && css.headFiltered)}>
      <button
        ref={triggerRef}
        type="button"
        className={clsx(css.headLabel, isOpen && css.headLabelOpen)}
        onClick={() => {
          place();
          setOpenColumn(isOpen ? null : column);
        }}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={isOpen ? listId : undefined}
        title={t("filterHint")}
      >
        {label}
      </button>
      <span className={css.sortGroup} role="group" aria-label={t("sortBy")}>
        <button
          type="button"
          className={clsx(
            css.sortBtn,
            isSorted && sort.dir === "asc" && css.sortBtnActive,
          )}
          aria-label={t("sortAsc")}
          aria-pressed={isSorted && sort.dir === "asc"}
          onClick={(event) => {
            event.stopPropagation();
            onSort(column, "asc");
          }}
        >
          ▲
        </button>
        <button
          type="button"
          className={clsx(
            css.sortBtn,
            isSorted && sort.dir === "desc" && css.sortBtnActive,
          )}
          aria-label={t("sortDesc")}
          aria-pressed={isSorted && sort.dir === "desc"}
          onClick={(event) => {
            event.stopPropagation();
            onSort(column, "desc");
          }}
        >
          ▼
        </button>
      </span>

      {portalReady
        ? createPortal(
            <AnimatePresence>
              {isOpen && box ? (
                <motion.div
                  key={`filter-${column}`}
                  ref={menuRef}
                  id={listId}
                  className={css.filterMenu}
                  role="dialog"
                  aria-label={t("filterColumn", { column: label })}
                  initial={reduceMotion ? false : popoverHidden}
                  animate={popoverShown}
                  exit={reduceMotion ? { opacity: 0 } : popoverExit}
                  transition={reduceMotion ? { duration: 0.01 } : tweenFast}
                  style={{
                    position: "fixed",
                    top: box.top,
                    left: box.left,
                    width: box.width,
                  }}
                >
                  <label className={css.filterOption}>
                    <input
                      type="checkbox"
                      checked={
                        active.size === options.length && options.length > 0
                      }
                      onChange={(event) => {
                        onFilterChange(
                          column,
                          event.target.checked ? null : new Set(),
                        );
                      }}
                    />
                    <span>{t("filterSelectAll")}</span>
                  </label>
                  <ul className={css.filterList}>
                    {options.map((option) => (
                      <li key={option}>
                        <label className={css.filterOption}>
                          <input
                            type="checkbox"
                            checked={active.has(option)}
                            onChange={() => {
                              const next = new Set(active);
                              if (next.has(option)) next.delete(option);
                              else next.add(option);
                              onFilterChange(
                                column,
                                next.size === options.length ? null : next,
                              );
                            }}
                          />
                          <span>{option}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  {filtered ? (
                    <button
                      type="button"
                      className={css.filterClear}
                      onClick={() => onFilterChange(column, null)}
                    >
                      {t("filterClear")}
                    </button>
                  ) : null}
                </motion.div>
              ) : null}
            </AnimatePresence>,
            document.body,
          )
        : null}
    </div>
  );
}

type ColumnDef = { key: ColumnKey; label: string; className: string };

type TeacherClassSessionsProps = {
  rows: TeacherLearningSessionRow[];
  showStudent?: boolean;
  title?: string;
  lead?: string;
  empty?: string;
  headingLevel?: "h1" | "h2";
  page?: number;
  paginationQueryParams?: Record<string, string | null | undefined>;
};

export function TeacherClassSessions({
  rows,
  showStudent = true,
  title,
  lead,
  empty,
  headingLevel = "h1",
  page = 1,
  paginationQueryParams = {},
}: TeacherClassSessionsProps) {
  const t = useTranslations("TeacherStudentSessions");
  const locale = useLocale();
  const router = useRouter();
  const isDesktop = useMinWidth(768);
  const [sort, setSort] = useState<SortState>({ key: "when", dir: "desc" });
  const [filters, setFilters] = useState<FilterState>({});
  const [openColumn, setOpenColumn] = useState<ColumnKey | null>(null);

  const labelCreated = useCallback(
    (by: TeacherLearningSessionRow["createdBy"]) =>
      t(`createdByValues.${by}`),
    [t],
  );
  const labelStatus = useCallback(
    (status: TeacherLearningSessionRow["status"]) => t(`statuses.${status}`),
    [t],
  );

  const columns = useMemo((): ColumnDef[] => {
    const list: ColumnDef[] = [];
    if (showStudent) {
      list.push({
        key: "student",
        label: t("student"),
        className: css.colStudent,
      });
    }
    list.push(
      { key: "theme", label: t("theme"), className: css.colTheme },
      { key: "correct", label: t("scoreDetail"), className: css.colNarrow },
      { key: "percent", label: "%", className: css.colNarrow },
      { key: "time", label: t("time"), className: css.colNarrow },
      { key: "speed", label: t("speed"), className: css.colNarrow },
      { key: "when", label: t("when"), className: css.colDate },
      { key: "createdBy", label: t("createdBy"), className: css.colCreated },
      { key: "status", label: t("status"), className: css.colStatus },
    );
    return list;
  }, [showStudent, t]);

  const optionsByColumn = useMemo(() => {
    const map = {} as Record<ColumnKey, string[]>;
    for (const col of columns) {
      const set = new Set<string>();
      for (const row of rows) {
        set.add(filterValue(row, col.key, labelCreated, labelStatus, locale));
      }
      map[col.key] = [...set].sort((a, b) => a.localeCompare(b, "uk"));
    }
    return map;
  }, [columns, rows, labelCreated, labelStatus, locale]);

  const visible = useMemo(() => {
    let list = rows.slice();
    for (const col of columns) {
      const selected = filters[col.key];
      if (!selected) continue;
      list = list.filter((row) =>
        selected.has(filterValue(row, col.key, labelCreated, labelStatus, locale)),
      );
    }
    list.sort((a, b) => compareRows(a, b, sort));
    return list;
  }, [rows, columns, filters, sort, labelCreated, labelStatus, locale]);

  const paginated = useMemo(
    () => paginateSlice(visible, page),
    [visible, page],
  );
  const pageRows = paginated.items;

  useEffect(() => {
    if (paginated.page === page) return;
    router.replace(
      queryHref("/sessions", {
        ...paginationQueryParams,
        page: paginated.page > 1 ? String(paginated.page) : null,
      }),
      { scroll: false },
    );
  }, [paginated.page, page, paginationQueryParams, router]);

  function onSort(key: ColumnKey, dir: SortDir) {
    setSort({ key, dir });
  }

  function onFilterChange(key: ColumnKey, next: Set<string> | null) {
    setFilters((prev) => {
      const copy = { ...prev };
      if (next == null) delete copy[key];
      else copy[key] = next;
      return copy;
    });
  }

  function renderStudentLink(row: TeacherLearningSessionRow): ReactNode {
    return (
      <Link
        href={queryHref("/sessions", {
          student: String(row.studentUserId),
        })}
        className={css.studentLink}
      >
        <span className={css.studentName}>{row.studentDisplayName}</span>
        <span className={css.login}>@{row.studentLogin}</span>
      </Link>
    );
  }

  function renderColumnHeader(col: ColumnDef) {
    return (
      <ColumnHeader
        column={col.key}
        label={col.label}
        sort={sort}
        onSort={onSort}
        options={optionsByColumn[col.key] ?? []}
        selected={filters[col.key] ?? null}
        onFilterChange={onFilterChange}
        openColumn={openColumn}
        setOpenColumn={setOpenColumn}
      />
    );
  }

  const TitleTag = headingLevel === "h2" ? "h2" : "h1";

  return (
    <section className={css.root} aria-labelledby="class-sessions-title">
      <header className={css.intro}>
        <TitleTag id="class-sessions-title" className={css.title}>
          {title ?? t("allTitle")}
        </TitleTag>
        <p className={css.lead}>{lead ?? t("allLead")}</p>
      </header>

      {rows.length === 0 ? (
        <p className={css.empty} role="status">
          {empty ?? t("emptyClass")}
        </p>
      ) : (
        <>
          <p className={css.count} aria-live="polite">
            {t("showing", { shown: visible.length, total: rows.length })}
          </p>

          {!isDesktop ? (
            <div className={css.sheetHead} role="row">
              {columns.map((col) => (
                <div
                  key={col.key}
                  className={clsx(css.sheetHeadCell, col.className)}
                  role="columnheader"
                >
                  {renderColumnHeader(col)}
                </div>
              ))}
            </div>
          ) : null}

          {!isDesktop && visible.length === 0 ? (
            <p className={css.empty} role="status">
              {t("filterEmpty")}
            </p>
          ) : null}

          {!isDesktop && visible.length > 0 ? (
            <ul className={css.cardList}>
              {pageRows.map((row) => (
                <li key={row.id} className={css.card}>
                  <div className={css.cardTop}>
                    {showStudent ? (
                      renderStudentLink(row)
                    ) : (
                      <span className={css.theme}>{row.themeName}</span>
                    )}
                    <span className={clsx(css.score, scoreClass(row.percent))}>
                      {formatPercent(row.percent)}
                    </span>
                  </div>
                  {showStudent ? (
                    <p className={css.theme}>{row.themeName}</p>
                  ) : null}
                  <dl className={css.meta}>
                    <div>
                      <dt>{t("scoreDetail")}</dt>
                      <dd>
                        {row.rightNumber}/{row.tasksNumber}
                      </dd>
                    </div>
                    <div>
                      <dt>{t("time")}</dt>
                      <dd>{formatDurationSeconds(row.timeSec, locale)}</dd>
                    </div>
                    <div>
                      <dt>{t("speed")}</dt>
                      <dd>{formatTimePerTask(row.timePerTaskSec)}</dd>
                    </div>
                      <div>
                        <dt>{t("when")}</dt>
                        <dd>
                          <DateCell label={row.startTimeLabel} />
                        </dd>
                      </div>
                  </dl>
                  <div className={css.cardFoot}>
                    <span className={clsx(css.status, statusClass(row.status))}>
                      {t(`statuses.${row.status}`)}
                    </span>
                    <span className={css.createdBy}>
                      {t(`createdByValues.${row.createdBy}`)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}

          {isDesktop ? (
            <div className={css.tableWrap}>
              <table className={css.table}>
                <thead>
                  <tr>
                    {columns.map((col) => (
                      <th
                        key={col.key}
                        scope="col"
                        className={clsx(css.headCell, col.className)}
                      >
                        {renderColumnHeader(col)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visible.length === 0 ? (
                    <tr>
                      <td
                        className={css.emptyCell}
                        colSpan={columns.length}
                        role="status"
                      >
                        {t("filterEmpty")}
                      </td>
                    </tr>
                  ) : (
                    pageRows.map((row) => (
                      <tr key={row.id}>
                        {showStudent ? (
                          <td className={css.colStudent}>
                            {renderStudentLink(row)}
                          </td>
                        ) : null}
                        <td className={css.colTheme}>{row.themeName}</td>
                        <td className={css.colNarrow}>
                          {row.rightNumber}/{row.tasksNumber}
                        </td>
                        <td className={css.colNarrow}>
                          <span
                            className={clsx(css.score, scoreClass(row.percent))}
                          >
                            {formatPercent(row.percent)}
                          </span>
                        </td>
                        <td className={css.colNarrow}>
                          {formatDurationSeconds(row.timeSec, locale)}
                        </td>
                        <td className={css.colNarrow}>
                          {formatTimePerTask(row.timePerTaskSec)}
                        </td>
                        <td className={css.colDate}>
                          <DateCell label={row.startTimeLabel} />
                        </td>
                        <td className={css.colCreated}>
                          {t(`createdByValues.${row.createdBy}`)}
                        </td>
                        <td className={css.colStatus}>
                          <span
                            className={clsx(
                              css.status,
                              statusClass(row.status),
                            )}
                          >
                            {t(`statuses.${row.status}`)}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : null}

          {visible.length > 0 ? (
            <Pagination
              pathname="/sessions"
              page={paginated.page}
              totalPages={paginated.totalPages}
              total={paginated.total}
              queryParams={paginationQueryParams}
            />
          ) : null}
        </>
      )}

      <p className={css.hint}>{t("hint")}</p>
    </section>
  );
}
