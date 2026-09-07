import type { SqlConnection } from "@/lib/db/mysql";
import { loadSelfScoreConnection } from "./schema";
import {
  reduceLatestSelfScores,
  type LatestSelfScores,
  type SelfScoreRow,
} from "./types";

const SQL_USER_SELF_SCORES = `
  SELECT theme_id, score, source
  FROM user_self_scores
  WHERE user_id = ?
  ORDER BY created_at DESC, id DESC
`;

type GetLatestSelfScoresDeps = {
  getConnection: () => Promise<SqlConnection>;
};

/**
 * Latest self-assessment per theme (pre_topic) plus the latest general
 * diagnostic score, for the `/results` fallback column. Plain query + JS
 * reduction (matches buildTopicResultRows's style) — no window functions,
 * to avoid assuming a specific MySQL version on shared hosting.
 */
export async function getLatestSelfScoresForResults(
  userId: number,
  deps: GetLatestSelfScoresDeps = { getConnection: loadSelfScoreConnection },
): Promise<LatestSelfScores> {
  const connection = await deps.getConnection();
  try {
    const rows = await connection.query<SelfScoreRow>(SQL_USER_SELF_SCORES, [
      userId,
    ]);
    return reduceLatestSelfScores(rows);
  } finally {
    connection.release();
  }
}
