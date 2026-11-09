import "server-only";

import { withConn, type Conn } from "./db";

/** Reads an answer token and deletes it, so the same button cannot be used again. */
export async function consumeMarathonBotToken(
  token: string,
  marathonId: number,
  userId: number,
  getConnection?: Conn,
): Promise<string | null> {
  return withConn(async (connection) => {
    await connection.beginTransaction();
    try {
      const rows = await connection.query<{ payload: string }>(
        `SELECT payload FROM marathon_bot_tokens
         WHERE token = ? AND marathon_id = ? AND user_id = ?`,
        [token, marathonId, userId],
      );
      await connection.execute(
        `DELETE FROM marathon_bot_tokens
         WHERE token = ? AND marathon_id = ? AND user_id = ?`,
        [token, marathonId, userId],
      );
      await connection.commit();
      return rows[0]?.payload ?? null;
    } catch (error) {
      try {
        await connection.rollback();
      } catch {}
      throw error;
    }
  }, getConnection);
}

export async function rememberMarathonButtonLabels(
  marathonId: number,
  rows: Array<{ data: string; label: string }>,
  getConnection?: Conn,
): Promise<void> {
  if (rows.length === 0) return;
  await withConn(async (connection) => {
    for (const row of rows) {
      const label = row.label.trim().slice(0, 64);
      const data = row.data.trim().slice(0, 32);
      if (!label || !data) continue;
      await connection.execute(
        `INSERT IGNORE INTO marathon_button_labels (marathon_id, callback_data, label)
         VALUES (?, ?, ?)`,
        [marathonId, data, label],
      );
    }
  }, getConnection);
}

export async function marathonCallbackFromStoredLabel(
  marathonId: number,
  label: string,
  getConnection?: Conn,
): Promise<string | null> {
  const trimmed = label.trim().slice(0, 64);
  if (!trimmed) return null;
  return withConn(async (connection) => {
    const rows = await connection.query<{ callback_data: string }>(
      `SELECT callback_data FROM marathon_button_labels
       WHERE marathon_id = ? AND label = ?
       LIMIT 1`,
      [marathonId, trimmed],
    );
    const data = rows[0]?.callback_data ?? "";
    return /^mh:[a-z]+$/.test(data) ? data : null;
  }, getConnection);
}

/** Drops every answer button for this participant, then stores the next task's set. */
export async function replaceMarathonBotTokens(
  marathonId: number,
  userId: number,
  rows: Array<{ token: string; payload: string }>,
  getConnection?: Conn,
): Promise<void> {
  await withConn(async (connection) => {
    await connection.beginTransaction();
    try {
      await connection.execute(
        `DELETE FROM marathon_bot_tokens WHERE marathon_id = ? AND user_id = ?`,
        [marathonId, userId],
      );
      for (const row of rows) {
        await connection.execute(
          `INSERT INTO marathon_bot_tokens (token, marathon_id, user_id, payload)
           VALUES (?, ?, ?, ?)`,
          [row.token, marathonId, userId, row.payload.slice(0, 240)],
        );
      }
      await connection.commit();
    } catch (error) {
      try {
        await connection.rollback();
      } catch {}
      throw error;
    }
  }, getConnection);
}
