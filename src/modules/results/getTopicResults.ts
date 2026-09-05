import type { SqlConnection } from "@/lib/db/mysql";
import { buildTopicResultRows, type TopicResultRow } from "./types";

const SQL_THEMES = `
  SELECT id, code, name, ord
  FROM themes
  ORDER BY ord ASC, id ASC
`;

const SQL_USER_SESSIONS = `
  SELECT id, theme_id, tasks_number, right_number, time
  FROM task_sessions
  WHERE user_id = ?
  ORDER BY id DESC
`;

type GetTopicResultsDeps = {
  getConnection: () => Promise<SqlConnection>;
};

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

/** Aggregated progress by theme for a student. */
export async function getTopicResults(
  userId: number,
  deps: GetTopicResultsDeps = { getConnection: loadDefaultConnection },
): Promise<TopicResultRow[]> {
  const connection = await deps.getConnection();
  try {
    const themes = await connection.query<{
      id: number;
      code: string;
      name: string;
      ord: number;
    }>(SQL_THEMES);

    const sessions = await connection.query<{
      id: number;
      theme_id: number;
      tasks_number: number;
      right_number: number;
      time: number;
    }>(SQL_USER_SESSIONS, [userId]);

    return buildTopicResultRows(themes, sessions);
  } finally {
    connection.release();
  }
}

export {
  buildTopicResultRows,
  formatPercent,
  formatSpeed,
  getScoreLevel,
} from "./types";

export type { ScoreLevel, TopicResultRow } from "./types";
