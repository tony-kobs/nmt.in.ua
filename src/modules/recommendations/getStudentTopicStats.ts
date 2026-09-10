import type { SqlConnection } from "@/lib/db/mysql";
import type { SessionRow, ThemeRow } from "@/modules/results/types";
import { SESSION_STATUS_COMPLETED } from "@/modules/sessions/types";

import { buildStudentTopicStats, type StudentTopicStats } from "./types";

/** Keep in sync with `getTopicResults` window — last N completed per theme. */
const SESSIONS_PER_THEME = 12;

const SQL_THEMES = `
  SELECT id, name, ord
  FROM themes
  ORDER BY ord ASC, id ASC
`;

const SQL_COMPLETED_SESSIONS = `
  SELECT id, theme_id, tasks_number, right_number, time
  FROM (
    SELECT
      id,
      theme_id,
      tasks_number,
      right_number,
      time,
      ROW_NUMBER() OVER (
        PARTITION BY theme_id
        ORDER BY id DESC
      ) AS rn
    FROM task_sessions
    WHERE user_id = ?
      AND session_status = ?
  ) ranked
  WHERE rn <= ${SESSIONS_PER_THEME}
  ORDER BY id DESC
`;

type GetStudentTopicStatsDeps = {
  getConnection: () => Promise<SqlConnection>;
};

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

/** Per-theme recommendation stats for a student, including themes with no completed sessions. */
export async function getStudentTopicStats(
  userId: number,
  deps: GetStudentTopicStatsDeps = { getConnection: loadDefaultConnection },
): Promise<StudentTopicStats> {
  const connection = await deps.getConnection();
  try {
    const themeRows = await connection.query<{
      id: number;
      name: string;
      ord: number;
    }>(SQL_THEMES);
    const sessionRows = await connection.query<{
      id: number;
      theme_id: number;
      tasks_number: number;
      right_number: number;
      time: number;
    }>(SQL_COMPLETED_SESSIONS, [userId, SESSION_STATUS_COMPLETED]);

    const themes: ThemeRow[] = themeRows.map((row) => ({
      id: row.id,
      name: row.name,
      ord: row.ord,
    }));

    const sessions: SessionRow[] = sessionRows.map((row) => ({
      id: row.id,
      theme_id: row.theme_id,
      tasks_number: row.tasks_number,
      right_number: row.right_number,
      time: row.time,
    }));

    return buildStudentTopicStats(themes, sessions);
  } finally {
    connection.release();
  }
}
