import "server-only";

import { withConn, type Conn } from "./db";

export type TelegramOutboxRow = {
  id: number;
  chatId: string;
  payload: string;
  attempts: number;
};

export async function enqueueMarathonTelegram(
  jobs: Array<{ chatId: string; payload: string; marathonId?: number | null }>,
  getConnection?: Conn,
): Promise<void> {
  if (jobs.length === 0) return;
  await withConn(async (connection) => {
    // All or nothing: a half-queued day would be queued again on retry.
    await connection.beginTransaction();
    try {
      for (const job of jobs) {
        await connection.execute(
          `INSERT INTO marathon_telegram_outbox (chat_id, marathon_id, payload) VALUES (?, ?, ?)`,
          [job.chatId, job.marathonId ?? null, job.payload],
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

export async function claimMarathonTelegram(
  limit: number,
  getConnection?: Conn,
): Promise<TelegramOutboxRow[]> {
  return withConn(async (connection) => {
    const size = Math.min(30, Math.max(1, Math.floor(limit)));
    const rows = await connection.query<{
      id: number;
      chat_id: string;
      payload: string;
      attempts: number;
    }>(
      `SELECT o.id, o.chat_id, o.payload, o.attempts
       FROM marathon_telegram_outbox o
       LEFT JOIN marathons m ON m.id = o.marathon_id
       WHERE o.status = 'pending'
         AND (o.not_before IS NULL OR o.not_before <= CURRENT_TIMESTAMP)
         AND (o.marathon_id IS NULL OR m.status IS NULL OR m.status <> 'archived')
       ORDER BY o.id
       LIMIT ${size}`,
      [],
    );
    const claimed: TelegramOutboxRow[] = [];
    for (const row of rows) {
      const result = await connection.execute(
        `UPDATE marathon_telegram_outbox
         SET not_before = DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 2 MINUTE), attempts = attempts + 1
         WHERE id = ? AND status = 'pending'`,
        [row.id],
      );
      if (result.affectedRows === 1) {
        claimed.push({
          id: row.id,
          chatId: String(row.chat_id),
          payload: row.payload,
          attempts: Number(row.attempts) + 1,
        });
      }
    }
    return claimed;
  }, getConnection);
}

export async function declineMarathon(
  marathonId: number,
  userId: number,
  getConnection?: Conn,
): Promise<void> {
  await withConn(async (connection) => {
    await connection.execute(
      `INSERT IGNORE INTO marathon_declines (marathon_id, user_id) VALUES (?, ?)`,
      [marathonId, userId],
    );
  }, getConnection);
}

/** Quiet hours: return the row to the queue and undo the claim's attempt increment. */
export async function postponeMarathonTelegram(
  id: number,
  notBefore: Date,
  getConnection?: Conn,
): Promise<void> {
  await withConn(async (connection) => {
    await connection.execute(
      `UPDATE marathon_telegram_outbox
       SET status = 'pending', not_before = ?, attempts = GREATEST(attempts - 1, 0)
       WHERE id = ?`,
      [notBefore, id],
    );
    try {
      await connection.execute(
        `UPDATE marathon_telegram_outbox
         SET hold_reason = 'quiet', error_text = NULL
         WHERE id = ?`,
        [id],
      );
    } catch (error) {
      if ((error as { errno?: number }).errno !== 1054) throw error;
    }
  }, getConnection);
}

/** Writes a short stored reason. Missing columns (before migration 047) are ignored. */
export async function noteMarathonTelegram(
  id: number,
  detail: { errorText?: string | null; holdReason?: "quiet" | "postpone" | null },
  getConnection?: Conn,
): Promise<void> {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (detail.errorText !== undefined) {
    sets.push("error_text = ?");
    params.push(detail.errorText);
  }
  if (detail.holdReason !== undefined) {
    sets.push("hold_reason = ?");
    params.push(detail.holdReason);
  }
  if (sets.length === 0) return;
  params.push(id);
  await withConn(async (connection) => {
    try {
      await connection.execute(
        `UPDATE marathon_telegram_outbox SET ${sets.join(", ")} WHERE id = ?`,
        params,
      );
    } catch (error) {
      if ((error as { errno?: number }).errno === 1054) return;
      throw error;
    }
  }, getConnection);
}

export async function finishMarathonTelegram(
  id: number,
  status: "sent" | "failed" | "pending",
  notBefore: Date | null,
  getConnection?: Conn,
): Promise<void> {
  await withConn(async (connection) => {
    await connection.execute(
      `UPDATE marathon_telegram_outbox
       SET status = ?, not_before = ?
       WHERE id = ?`,
      [status, notBefore, id],
    );
  }, getConnection);
}
