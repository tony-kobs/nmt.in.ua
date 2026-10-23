import "server-only";

import type { SqlConnection } from "@/lib/db/mysql";
import { mysqlErrno } from "@/modules/teacher-students/mysqlErrno";
import { isCopyKey, type CopyKey } from "./copy";
import {
  applySurvey,
  summarizeSurveys,
  surveyAuthorLabel,
  surveyPrompt,
  type SurveyAnswer,
  type SurveyEvent,
  type SurveyPrompt,
  type SurveyRating,
  type SurveyState,
  type SurveySummary,
} from "./survey";

type Conn = () => Promise<SqlConnection>;

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

async function withConn<T>(fn: (connection: SqlConnection) => Promise<T>, getConnection: Conn = loadDefaultConnection): Promise<T> {
  const { ensureMarathonSchema } = await import("../schema");
  await ensureMarathonSchema(getConnection);
  const connection = await getConnection();
  try {
    return await fn(connection);
  } finally {
    connection.release();
  }
}

function rating(value: unknown): SurveyRating | null {
  const number = Number(value);
  return number >= 1 && number <= 5 ? number as SurveyRating : null;
}

function stateFrom(row: {
  rating: number | null;
  improve_text: string | null;
  recommend: number | null;
  status: string;
  step: string;
}): SurveyState | null {
  if (row.status !== "active" && row.status !== "done" && row.status !== "skipped") return null;
  if (row.step !== "rating" && row.step !== "improve" && row.step !== "recommend") return null;
  return {
    status: row.status,
    step: row.step,
    rating: rating(row.rating),
    improve: row.improve_text,
    recommend: row.recommend == null ? null : Number(row.recommend) === 1,
  };
}

async function readState(connection: SqlConnection, marathonId: number, userId: number): Promise<SurveyState | null> {
  const rows = await connection.query<{
    rating: number | null;
    improve_text: string | null;
    recommend: number | null;
    status: string;
    step: string;
  }>(
    `SELECT rating, improve_text, recommend, status, step
     FROM marathon_surveys WHERE marathon_id = ? AND user_id = ? LIMIT 1`,
    [marathonId, userId],
  );
  return rows[0] ? stateFrom(rows[0]) : null;
}

async function writeState(connection: SqlConnection, marathonId: number, userId: number, state: SurveyState): Promise<void> {
  await connection.execute(
    `UPDATE marathon_surveys
     SET rating = ?, improve_text = ?, recommend = ?, status = ?, step = ?
     WHERE marathon_id = ? AND user_id = ? AND status = 'active'`,
    [
      state.rating,
      state.improve,
      state.recommend == null ? null : state.recommend ? 1 : 0,
      state.status,
      state.step,
      marathonId,
      userId,
    ],
  );
}

/** Asks once, when the bot has just finished the last day. A second call does not ask again. */
export async function openFinalSurvey(
  marathonId: number,
  userId: number,
  copy?: Partial<Record<CopyKey, string>>,
): Promise<SurveyPrompt | null> {
  return withConn(async (connection) => {
    const inserted = await connection.execute(
      `INSERT IGNORE INTO marathon_surveys (marathon_id, user_id, status, step)
       VALUES (?, ?, 'active', 'rating')`,
      [marathonId, userId],
    );
    return inserted.affectedRows === 1 ? surveyPrompt("rating", copy) : null;
  });
}

export async function answerSurvey(
  marathonId: number,
  userId: number,
  event: SurveyEvent,
  copy?: Partial<Record<CopyKey, string>>,
): Promise<SurveyPrompt | null> {
  return withConn(async (connection) => {
    const current = await readState(connection, marathonId, userId);
    if (!current) return null;
    const next = applySurvey(current, event);
    if (!next) return null;
    await writeState(connection, marathonId, userId, next.state);
    return surveyPrompt(next.prompt, copy);
  });
}

/** Free-text answer for the open “what to improve” step of this chat. */
export async function takeSurveyText(
  chatId: string,
  body: string,
): Promise<SurveyPrompt | null> {
  if (!/^[1-9]\d{0,19}$/.test(chatId) || !process.env.DB_HOST) return null;
  try {
    return await withConn(async (connection) => {
      const rows = await connection.query<{ marathon_id: number; user_id: number }>(
        `SELECT s.marathon_id, s.user_id
         FROM marathon_surveys s
         INNER JOIN marathon_participants p ON p.marathon_id = s.marathon_id AND p.user_id = s.user_id
         WHERE p.telegram_chat_id = ? AND s.status = 'active' AND s.step = 'improve'
         ORDER BY s.updated_at DESC
         LIMIT 1`,
        [chatId],
      );
      const row = rows[0];
      if (!row) return null;
      const current = await readState(connection, row.marathon_id, row.user_id);
      if (!current) return null;
      const next = applySurvey(current, { type: "improve", text: body });
      if (!next) return null;
      await writeState(connection, row.marathon_id, row.user_id, next.state);
      return surveyPrompt(next.prompt, await copyFor(connection, row.marathon_id));
    });
  } catch (error) {
    console.error("marathon survey text", error);
    return null;
  }
}

export async function loadSurveySummaries(marathonIds: number[]): Promise<Map<number, SurveySummary>> {
  if (marathonIds.length === 0) return new Map();
  try {
    return await withConn(async (connection) => {
      const marks = marathonIds.map(() => "?").join(", ");
      const rows = await connection.query<{
        marathon_id: number;
        display_name: string | null;
        login: string | null;
        telegram_username: string | null;
        rating: number | null;
        improve_text: string | null;
        recommend: number | null;
        status: string;
      }>(
        `SELECT s.marathon_id, u.display_name, u.login, uta.telegram_username,
                s.rating, s.improve_text, s.recommend, s.status
         FROM marathon_surveys s
         INNER JOIN app_users u ON u.id = s.user_id
         LEFT JOIN user_telegram_accounts uta ON uta.user_id = u.id
         WHERE s.marathon_id IN (${marks})
           AND (s.status <> 'active' OR s.rating IS NOT NULL OR s.improve_text IS NOT NULL)
         ORDER BY s.updated_at DESC, s.user_id DESC`,
        marathonIds,
      );
      const answers: SurveyAnswer[] = rows.flatMap((row) => {
        if (row.status !== "active" && row.status !== "done" && row.status !== "skipped") return [];
        return [{
          marathonId: Number(row.marathon_id),
          name: surveyAuthorLabel({
            displayName: row.display_name,
            login: row.login,
            telegramUsername: row.telegram_username,
          }),
          rating: rating(row.rating),
          improve: row.improve_text,
          recommend: row.recommend == null ? null : Number(row.recommend) === 1,
          status: row.status,
        }];
      });
      return summarizeSurveys(answers);
    });
  } catch (error) {
    const errno = mysqlErrno(error);
    if (errno === 1146 || errno === 1054) return new Map();
    throw error;
  }
}

async function copyFor(
  connection: SqlConnection,
  marathonId: number,
): Promise<Partial<Record<CopyKey, string>>> {
  const rows = await connection.query<{ copy_key: string; body: string }>(
    `SELECT copy_key, body FROM marathon_copy WHERE marathon_id = ?`,
    [marathonId],
  );
  const copy: Partial<Record<CopyKey, string>> = {};
  for (const row of rows) {
    if (isCopyKey(row.copy_key) && row.body.trim()) copy[row.copy_key] = row.body;
  }
  return copy;
}
