import type { SqlConnection } from "@/lib/db/mysql";
import { SESSION_STATUS_COMPLETED } from "@/modules/sessions/types";
import { TASK_TYPE_NMT } from "./startNmtSimulator";
import { TASK_STATUS_INCORRECT } from "./types";
import {
  normalizeNmtComment,
  normalizeNmtRichText,
} from "./normalizeNmtRichText";

const SQL_TOPIC_MISTAKES = `
  SELECT
    qt.name,
    qt.task_text,
    qt.comments,
    t.id AS theme_id,
    t.code AS theme_code,
    t.name AS theme_name
  FROM tasks2session t2s
  INNER JOIN task_sessions ts ON ts.id = t2s.session_id
  INNER JOIN quiz_tasks qt ON qt.id = t2s.task_id
  LEFT JOIN themes t ON t.id = qt.theme_id
  WHERE t2s.session_id = ?
    AND ts.user_id = ?
    AND ts.session_status = ?
    AND t2s.status = ?
    AND t2s.task_type <> ?
  ORDER BY t2s.id ASC
`;

const SQL_NMT_MISTAKES = `
  SELECT
    qt.name,
    qt.task_text,
    qt.comments,
    t.id AS theme_id,
    t.code AS theme_code,
    t.name AS theme_name
  FROM tasks2session t2s
  INNER JOIN task_sessions ts ON ts.id = t2s.session_id
  INNER JOIN nmt_quiz_tasks qt ON qt.id = t2s.task_id
  LEFT JOIN themes t ON t.id = qt.theme_id
  WHERE t2s.session_id = ?
    AND ts.user_id = ?
    AND ts.session_status = ?
    AND t2s.status = ?
    AND t2s.task_type = ?
  ORDER BY t2s.id ASC
`;

const SQL_HAS_NMT = `
  SELECT 1 AS ok
  FROM tasks2session
  WHERE session_id = ? AND task_type = ?
  LIMIT 1
`;

export type SessionMistakeItem = {
  name: string;
  taskText: string;
  comment: string;
  themeId: number | null;
  themeCode: string | null;
  themeName: string | null;
};

type MistakeRow = {
  name: string;
  task_text: string;
  comments: string | null;
  theme_id: number | null;
  theme_code: string | null;
  theme_name: string | null;
};

type GetSessionMistakeReviewDeps = {
  getConnection: () => Promise<SqlConnection>;
};

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function cleanComment(raw: string | null): string {
  return normalizeNmtComment(raw);
}

function mapMistakeRow(row: MistakeRow, isNmt: boolean): SessionMistakeItem {
  const themeId =
    typeof row.theme_id === "number" && row.theme_id > 0 ? row.theme_id : null;
  const themeCode = row.theme_code?.trim() || null;
  const themeName = row.theme_name?.trim() || null;
  const taskText = isNmt
    ? normalizeNmtRichText(row.task_text)
    : row.task_text.trim();
  return {
    name: row.name.trim(),
    taskText,
    comment:
      isNmt
        ? (() => {
            const cleaned = cleanComment(row.comments);
            return cleaned === "—" || cleaned === "-" ? "" : cleaned;
          })()
        : (row.comments ?? "").trim(),
    themeId,
    themeCode,
    themeName,
  };
}

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

/** Wrong/skipped tasks with comments — only for completed sessions. */
export async function getSessionMistakeReview(
  sessionId: number,
  userId: number,
  deps: GetSessionMistakeReviewDeps = { getConnection: loadDefaultConnection },
): Promise<SessionMistakeItem[]> {
  if (!isPositiveInt(sessionId) || !isPositiveInt(userId)) {
    return [];
  }

  const connection = await deps.getConnection();
  try {
    const nmtFlag = await connection.query<{ ok: number }>(SQL_HAS_NMT, [
      sessionId,
      TASK_TYPE_NMT,
    ]);
    const isNmt = nmtFlag.length > 0;
    const sql = isNmt ? SQL_NMT_MISTAKES : SQL_TOPIC_MISTAKES;
    const rows = await connection.query<MistakeRow>(sql, [
      sessionId,
      userId,
      SESSION_STATUS_COMPLETED,
      TASK_STATUS_INCORRECT,
      TASK_TYPE_NMT,
    ]);

    return rows.map((row) => mapMistakeRow(row, isNmt));
  } finally {
    connection.release();
  }
}
