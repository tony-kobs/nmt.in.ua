import type { SqlConnection } from "@/lib/db/mysql";
import {
  buildLearningSessionRows,
  type LearningSessionRow,
} from "./types";

/** Default page size for `/sessions` — avoids unbounded history growth. */
export const LEARNING_SESSIONS_PAGE_SIZE = 50;

type GetLearningSessionsDeps = {
  getConnection: () => Promise<SqlConnection>;
};

export type GetLearningSessionsOptions = {
  /** Max rows (newest first). Capped at 200. */
  limit?: number;
};

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

function resolveLimit(limit: number | undefined): number {
  const raw = limit ?? LEARNING_SESSIONS_PAGE_SIZE;
  if (!Number.isInteger(raw) || raw <= 0) return LEARNING_SESSIONS_PAGE_SIZE;
  return Math.min(raw, 200);
}

export async function getLearningSessions(
  userId: number,
  deps: GetLearningSessionsDeps = { getConnection: loadDefaultConnection },
  options: GetLearningSessionsOptions = {},
): Promise<LearningSessionRow[]> {
  const limit = resolveLimit(options.limit);
  const sql = `
  SELECT
    ts.id,
    ts.theme_id,
    t.name AS theme_name,
    ts.tasks_number,
    ts.right_number,
    ts.time,
    ts.session_status,
    ts.session_type,
    ts.start_time
  FROM task_sessions ts
  INNER JOIN themes t ON t.id = ts.theme_id
  WHERE ts.user_id = ?
  ORDER BY ts.id DESC
  LIMIT ${limit}
`;

  const connection = await deps.getConnection();
  try {
    const rows = await connection.query<{
      id: number;
      theme_id: number;
      theme_name: string;
      tasks_number: number;
      right_number: number;
      time: number;
      session_status: number;
      session_type: number;
      start_time: number;
    }>(sql, [userId]);

    return buildLearningSessionRows(rows);
  } finally {
    connection.release();
  }
}

export type { LearningSessionRow } from "./types";
