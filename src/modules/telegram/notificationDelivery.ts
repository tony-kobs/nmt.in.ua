import "server-only";
import type { SqlConnection } from "@/lib/db/mysql";

export const TELEGRAM_NEW_TASK_NOTIFICATION = "new_task";
export const TELEGRAM_DEADLINE_NOTIFICATION = "deadline_soon";
/** `notification_type` defaults to `new_task`, so TG-007 callers keep their keys. */
export type NotificationKey = { accountId: number; sessionId: number; type?: string };

function keyParams(key: NotificationKey): [number, number, string] {
  return [key.accountId, key.sessionId, key.type ?? TELEGRAM_NEW_TASK_NOTIFICATION];
}

/**
 * Only `ready` rows can be claimed. A `sending` row means Telegram may already have shown the
 * message (timeout, lost reply, crash after send), so it is never re-sent automatically; an
 * operator resets it to `ready` after confirming nothing was delivered.
 */
export function isNotificationClaimable(state: string | undefined): boolean {
  return state === "ready";
}

export async function claimNotification(connection: SqlConnection, key: NotificationKey): Promise<boolean> {
  const params = keyParams(key);
  try {
    await connection.beginTransaction();
    await connection.execute(`INSERT INTO telegram_task_notifications (account_id, session_id, notification_type)
      VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE account_id = account_id`, params);
    const rows = await connection.query<{ delivery_state: string }>(`SELECT delivery_state FROM telegram_task_notifications
      WHERE account_id = ? AND session_id = ? AND notification_type = ? FOR UPDATE`, params);
    if (!isNotificationClaimable(rows[0]?.delivery_state)) {
      await connection.rollback();
      return false;
    }
    await connection.execute(`UPDATE telegram_task_notifications SET delivery_state = 'sending', attempted_at = CURRENT_TIMESTAMP
      WHERE account_id = ? AND session_id = ? AND notification_type = ?`, params);
    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    throw error;
  }
}

export async function recordNotificationResult(connection: SqlConnection, key: NotificationKey, messageId?: number): Promise<void> {
  const result = await connection.execute(`UPDATE telegram_task_notifications
    SET delivery_state = ?, delivered_at = ${messageId === undefined ? "NULL" : "CURRENT_TIMESTAMP"}, telegram_message_id = ?
    WHERE account_id = ? AND session_id = ? AND notification_type = ? AND delivery_state = 'sending'`,
  [messageId === undefined ? "ready" : "delivered", messageId ?? null, ...keyParams(key)]);
  if (result.affectedRows !== 1) throw new Error("Telegram notification delivery state was not saved.");
}

/** Delivery state of one ledger row without locking; used to order reminders after the new-task message. */
export async function readNotificationState(connection: SqlConnection, key: NotificationKey): Promise<{ state: string; deliveredAt: number | null } | null> {
  const rows = await connection.query<{ delivery_state: string; delivered_unix?: number | string | null }>(`SELECT delivery_state,
    UNIX_TIMESTAMP(delivered_at) AS delivered_unix FROM telegram_task_notifications
    WHERE account_id = ? AND session_id = ? AND notification_type = ?`, keyParams(key));
  const row = rows[0];
  if (!row) return null;
  const deliveredAt = row.delivered_unix == null ? NaN : Number(row.delivered_unix);
  return { state: row.delivery_state, deliveredAt: Number.isFinite(deliveredAt) ? deliveredAt : null };
}
