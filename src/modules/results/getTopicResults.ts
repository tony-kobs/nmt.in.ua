import type { SqlConnection } from "@/lib/db/mysql";
import { getLatestSelfScoresForResults } from "@/modules/self-score/getLatestSelfScoresForResults";
import { resolveDisplaySelfScore, type LatestSelfScores } from "@/modules/self-score/types";
import { buildTopicResultRows, type TopicResultRow } from "./types";

/** Newest N attempts per theme — enough for overall / last-three without full history. */
export const TOPIC_RESULTS_SESSIONS_PER_THEME = 12;

const SQL_THEMES = `
  SELECT id, code, name, ord
  FROM themes
  ORDER BY ord ASC, id ASC
`;

const SQL_USER_SESSIONS = `
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
  ) ranked
  WHERE rn <= ${TOPIC_RESULTS_SESSIONS_PER_THEME}
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
  let themes: { id: number; code: string; name: string; ord: number }[];
  let sessions: {
    id: number;
    theme_id: number;
    tasks_number: number;
    right_number: number;
    time: number;
  }[];
  try {
    themes = await connection.query(SQL_THEMES);
    sessions = await connection.query(SQL_USER_SESSIONS, [userId]);
  } finally {
    connection.release();
  }

  const rows = buildTopicResultRows(themes, sessions);
  const latestSelfScores = await getLatestSelfScoresForResults(userId, {
    getConnection: deps.getConnection,
  });
  return attachSelfScores(rows, latestSelfScores);
}

export {
  buildTopicResultRows,
  formatPercent,
  formatSpeed,
  getScoreLevel,
} from "./types";

export type { ScoreLevel, TopicResultRow } from "./types";
