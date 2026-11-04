import type { SqlConnection } from "@/lib/db/mysql";
import {
  SESSION_STATUS_COMPLETED,
  sessionPercent,
} from "@/modules/sessions/types";
import { sessionThemeLabel } from "@/modules/themes/sessionThemeLabel";

export type RecentResultItem = {
  sessionId: number;
  topic: string;
  score: number;
};

/** MySQL prepared statements do not accept `LIMIT ?` — inline a validated int. */
function buildRecentResultsSql(limit: number): string {
  return `
  SELECT
    ts.id,
    ts.theme_id,
    ts.session_type,
    t.name AS theme_name,
    ts.tasks_number,
    ts.right_number
  FROM task_sessions ts
  LEFT JOIN themes t ON t.id = ts.theme_id
  WHERE ts.user_id = ?
    AND ts.session_status = ?
  ORDER BY ts.id DESC
  LIMIT ${limit}
`;
}

type RecentResultRow = {
  id: number;
  theme_id: number | null;
  session_type: number | null;
  theme_name: string | null;
  tasks_number: number;
  right_number: number;
};

type GetRecentResultsDeps = {
  getConnection: () => Promise<SqlConnection>;
};

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

/** Last N completed sessions for the account page «Останні результати». */
export async function getRecentResults(
  userId: number,
  limit: number = 4,
  deps: GetRecentResultsDeps = { getConnection: loadDefaultConnection },
): Promise<RecentResultItem[]> {
  const safeLimit = Number.isInteger(limit) && limit > 0 ? limit : 4;

  const connection = await deps.getConnection();
  try {
    const rows = await connection.query<RecentResultRow>(
      buildRecentResultsSql(safeLimit),
      [userId, SESSION_STATUS_COMPLETED],
    );

    return rows.map((row) => ({
      sessionId: row.id,
      topic: sessionThemeLabel({
        themeName: row.theme_name,
        themeId: row.theme_id,
        sessionType: row.session_type,
      }),
      score: Math.round(
        sessionPercent(row.tasks_number, row.right_number) ?? 0,
      ),
    }));
  } finally {
    connection.release();
  }
}
