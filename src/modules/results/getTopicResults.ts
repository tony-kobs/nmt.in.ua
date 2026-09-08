import type { SqlConnection } from "@/lib/db/mysql";
import { getLatestSelfScoresForResults } from "@/modules/self-score/getLatestSelfScoresForResults";
import { resolveDisplaySelfScore, type LatestSelfScores } from "@/modules/self-score/types";
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

/** Attaches the self-score fallback (latest pre_topic, else latest
 * diagnostic_overall) to each row — a pure post-process step so
 * `buildTopicResultRows` itself (and its existing tests) stay untouched. */
export function attachSelfScores(
  rows: TopicResultRow[],
  latest: LatestSelfScores,
): TopicResultRow[] {
  return rows.map((row) => ({
    ...row,
    selfScore: resolveDisplaySelfScore(row.themeId, latest),
  }));
}

/** Aggregated progress by theme for a student, including the self-score
 * column ("Самооцінка" on /results). */
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

    const rows = buildTopicResultRows(themes, sessions);
    const latestSelfScores = await getLatestSelfScoresForResults(userId, {
      getConnection: deps.getConnection,
    });
    return attachSelfScores(rows, latestSelfScores);
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
