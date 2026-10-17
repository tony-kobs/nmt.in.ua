import type { SqlConnection } from "@/lib/db/mysql";
import { ensureMentorAssignmentsSchema } from "@/modules/mentor-assignments/schema";
import { nowUnixSec } from "@/modules/testing/sessionElapsed";
import { belongsInStudentSessions } from "./studentSessionList";
import { buildLearningSessionRows, type LearningSessionRow } from "./types";

/** Default page size for `/sessions` — avoids unbounded history growth. */
export const LEARNING_SESSIONS_PAGE_SIZE = 50;

type GetLearningSessionsDeps = {
  getConnection: () => Promise<SqlConnection>;
  nowSec?: () => number;
  ensureSchema?: () => Promise<void>;
};

export type GetLearningSessionsOptions = {
  /** Max rows (newest first). Capped at 200. */
  limit?: number;
};

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

export function resolveLearningSessionsLimit(
  limit: number | undefined
): number {
  const raw = limit ?? LEARNING_SESSIONS_PAGE_SIZE;
  if (!Number.isInteger(raw) || raw <= 0) return LEARNING_SESSIONS_PAGE_SIZE;
  return Math.min(raw, 200);
}

export async function getLearningSessions(
  userId: number,
  deps: GetLearningSessionsDeps = { getConnection: loadDefaultConnection },
  options: GetLearningSessionsOptions = {}
): Promise<LearningSessionRow[]> {
  const limit = resolveLearningSessionsLimit(options.limit);
  await (
    deps.ensureSchema ??
    (() => ensureMentorAssignmentsSchema(deps.getConnection))
  )();

  const sql = `
  SELECT
    ts.id,
    ts.theme_id,
    COALESCE(
      NULLIF(TRIM(t.name), ''),
      NULLIF(TRIM(CONCAT(nv.year, ' · ', nv.label)), ''),
      'Симулятор НМТ'
    ) AS theme_name,
    ts.tasks_number,
    ts.right_number,
    ts.time,
    ts.session_status,
    ts.session_type,
    ts.start_time,
    ts.expire_time,
    ma.id AS assignment_id,
    mam.session_id AS member_session_id,
    ma.available_at,
    ma.difficulty,
    ma.due_at
  FROM task_sessions ts
  LEFT JOIN themes t ON t.id = ts.theme_id
  LEFT JOIN nmt_variants nv ON nv.id = ts.nmt_variant_id
  LEFT JOIN mentor_assignment_members mam ON mam.session_id = ts.id
  LEFT JOIN mentor_assignments ma
    ON ma.id = mam.assignment_id AND ma.status = 'active'
  WHERE ts.user_id = ?
    AND (
      (
        ts.session_type = 3
        AND (ma.id IS NOT NULL OR mam.session_id IS NULL)
      )
      OR (
        ts.session_type IN (1, 4)
        AND (
          ts.session_status = 1
          OR (
            ts.tasks_number > 0
            AND ts.right_number >= ts.tasks_number
            AND ts.time > 0
          )
        )
      )
    )
  ORDER BY ts.id DESC
  LIMIT ${limit}
`;

  const connection = await deps.getConnection();
  try {
    const rows = await connection.query<{
      id: number;
      theme_id: number | null;
      theme_name: string;
      tasks_number: number;
      right_number: number;
      time: number;
      session_status: number;
      session_type: number;
      start_time: number;
      expire_time: number;
      assignment_id: number | null;
      member_session_id: number | null;
      available_at: number | null;
      due_at: number | null;
      difficulty: number | null;
    }>(sql, [userId]);

    const visible = rows.filter((row) => belongsInStudentSessions(row));
    const nowSec = deps.nowSec ?? nowUnixSec;
    return buildLearningSessionRows(
      visible.map((row) => ({
        ...row,
        theme_id: row.theme_id == null ? 0 : Number(row.theme_id),
        theme_name: row.theme_name?.trim() || "Симулятор НМТ",
      })),
      nowSec(),
    );
  } finally {
    connection.release();
  }
}

export type { LearningSessionRow } from "./types";
