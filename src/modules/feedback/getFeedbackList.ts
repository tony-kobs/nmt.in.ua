import type { SqlConnection } from "@/lib/db/mysql";
import { ensureFeedbackSchema, loadFeedbackConnection } from "./schema";
import {
  FEEDBACK_LIST_LIMIT,
  isFeedbackScore,
  isFeedbackSource,
  type SiteFeedback,
} from "./types";

type GetFeedbackListDeps = {
  getConnection: () => Promise<SqlConnection>;
};

type FeedbackRow = {
  id: number;
  user_id: number | null;
  session_id: number | null;
  score: number;
  message: string | null;
  email: string | null;
  source: string;
  created_at: Date | string;
  display_name: string | null;
  login: string | null;
};

const SQL_LIST = `
  SELECT
    f.id,
    f.user_id,
    f.session_id,
    f.score,
    f.message,
    f.email,
    f.source,
    f.created_at,
    u.display_name,
    u.login
  FROM site_feedback f
  LEFT JOIN app_users u ON u.id = f.user_id
  ORDER BY f.id DESC
  LIMIT ${FEEDBACK_LIST_LIMIT}
`;

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function mapRow(row: FeedbackRow): SiteFeedback | null {
  if (!isFeedbackScore(row.score) || !isFeedbackSource(row.source)) {
    return null;
  }
  return {
    id: row.id,
    userId: row.user_id,
    sessionId: row.session_id,
    score: row.score,
    message: row.message?.trim() || null,
    email: row.email?.trim() || null,
    source: row.source,
    createdAt: toDate(row.created_at),
    userDisplayName: row.display_name?.trim() || null,
    userLogin: row.login?.trim() || null,
  };
}

/** Newest site feedback for the admin settings panel. Not for students. */
export async function getFeedbackList(
  deps: GetFeedbackListDeps = { getConnection: loadFeedbackConnection },
): Promise<SiteFeedback[]> {
  await ensureFeedbackSchema(deps.getConnection);
  const connection = await deps.getConnection();
  try {
    const rows = await connection.query<FeedbackRow>(SQL_LIST);
    return rows
      .map(mapRow)
      .filter((row): row is SiteFeedback => row !== null);
  } finally {
    connection.release();
  }
}
