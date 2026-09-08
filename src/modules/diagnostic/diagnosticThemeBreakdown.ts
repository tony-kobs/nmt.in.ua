import type { SqlConnection } from "@/lib/db/mysql";
import { sessionPercent } from "@/modules/sessions/types";
import { TASK_STATUS_CORRECT } from "@/modules/testing/types";
import { isValidOwner, ownerClause, ownerParams, type SessionOwner } from "./sessionOwner";

const SESSION_TYPE_DIAGNOSTIC = 5;

/** Per-theme correct/total for one diagnostic attempt — derived from the same
 * `tasks2session` rows the session already stores, joined to the theme each
 * task belongs to (`quiz_tasks.theme_id`). No new columns or tables: a
 * diagnostic session never persists which theme a task came from, but every
 * task it samples still points at one via `quiz_tasks`, so the breakdown is
 * always reconstructible from existing data. */
const SQL_THEME_BREAKDOWN = `
  SELECT
    qt.theme_id AS theme_id,
    th.code AS theme_code,
    th.name AS theme_name,
    th.ord AS theme_ord,
    SUM(CASE WHEN t2s.status = ${TASK_STATUS_CORRECT} THEN 1 ELSE 0 END) AS correct,
    COUNT(*) AS total
  FROM tasks2session t2s
  INNER JOIN quiz_tasks qt ON qt.id = t2s.task_id
  INNER JOIN themes th ON th.id = qt.theme_id
  INNER JOIN task_sessions ts ON ts.id = t2s.session_id
  WHERE t2s.session_id = ? AND ts.session_type = ${SESSION_TYPE_DIAGNOSTIC}
    AND ${ownerClause("t2s")}
  GROUP BY qt.theme_id, th.code, th.name, th.ord
  ORDER BY th.ord ASC, qt.theme_id ASC
`;

export type DiagnosticThemeStat = {
  themeId: number;
  themeCode: string;
  themeName: string;
  ord: number;
  correct: number;
  total: number;
  /** 0-100, rounded down to the nearest whole percent via `sessionPercent`. */
  percent: number;
};

export type DiagnosticTopicInsight = {
  /** Up to 3 themes with the highest percent — "already going well". */
  strongest: DiagnosticThemeStat[];
  /** Up to 3 themes with the lowest percent — study these first. */
  priority: DiagnosticThemeStat[];
};

type ThemeBreakdownRow = {
  theme_id: number;
  theme_code: string;
  theme_name: string;
  theme_ord: number;
  correct: number;
  total: number;
};

type GetDiagnosticThemeBreakdownDeps = {
  getConnection: () => Promise<SqlConnection>;
};

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function mapRow(row: ThemeBreakdownRow): DiagnosticThemeStat {
  return {
    themeId: row.theme_id,
    themeCode: row.theme_code.trim(),
    themeName: row.theme_name.trim(),
    ord: row.theme_ord,
    correct: row.correct,
    total: row.total,
    percent: sessionPercent(row.total, row.correct) ?? 0,
  };
}

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

/**
 * Owner-aware, read-only: per-theme correct/total for one completed (or
 * in-progress) diagnostic session. Returns `[]` for a session with no
 * answered tasks yet or one that doesn't belong to this owner — callers use
 * this only to enrich the result screen, so an empty breakdown should hide
 * the topic cards, never fail the page.
 */
export async function getDiagnosticThemeBreakdown(
  sessionId: unknown,
  owner: SessionOwner,
  deps: GetDiagnosticThemeBreakdownDeps = { getConnection: loadDefaultConnection },
): Promise<DiagnosticThemeStat[]> {
  if (!isPositiveInt(sessionId) || !isValidOwner(owner)) {
    return [];
  }

  const connection = await deps.getConnection();
  try {
    const rows = await connection.query<ThemeBreakdownRow>(SQL_THEME_BREAKDOWN, [
      sessionId,
      ...ownerParams(owner),
    ]);
    return rows.map(mapRow);
  } finally {
    connection.release();
  }
}

function byPercentThenOrd(direction: 1 | -1) {
  return (a: DiagnosticThemeStat, b: DiagnosticThemeStat): number =>
    direction * (a.percent - b.percent) || a.ord - b.ord || a.themeId - b.themeId;
}

export const PRIORITY_TOPICS_LIMIT = 3;
export const STRONG_TOPICS_LIMIT = 3;

/** Weakest themes first — "study these next" per the result screen copy. */
export function selectPriorityTopics(
  stats: DiagnosticThemeStat[],
  limit: number = PRIORITY_TOPICS_LIMIT,
): DiagnosticThemeStat[] {
  return [...stats].sort(byPercentThenOrd(1)).slice(0, limit);
}

/** Strongest themes first — "already going well". */
export function selectStrongTopics(
  stats: DiagnosticThemeStat[],
  limit: number = STRONG_TOPICS_LIMIT,
): DiagnosticThemeStat[] {
  return [...stats].sort(byPercentThenOrd(-1)).slice(0, limit);
}

export function toDiagnosticTopicInsight(
  stats: DiagnosticThemeStat[],
): DiagnosticTopicInsight {
  return {
    strongest: selectStrongTopics(stats),
    priority: selectPriorityTopics(stats),
  };
}
