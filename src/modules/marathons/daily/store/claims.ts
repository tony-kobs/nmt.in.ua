import "server-only";

import type { NotifyIntent, NotifyKind } from "../notifications";
import { withConn, type Conn } from "./db";

/** A claim that was never confirmed (the run died mid-send) can be taken again after this. */
export const STALE_NOTIFICATION_CLAIM_MINUTES = 10;

type NotifyKey = Pick<NotifyIntent, "marathonId" | "userId" | "dayNumber" | "channel"> & {
  kind: NotifyKind | "registered" | "rank";
};

function notifyKeyParams(intent: NotifyKey): unknown[] {
  return [intent.marathonId, intent.userId, intent.dayNumber, intent.kind, intent.channel];
}

/**
 * Inserts an unconfirmed claim. A duplicate is reclaimed only when it was never
 * confirmed and is older than STALE_NOTIFICATION_CLAIM_MINUTES.
 */
export async function claimNotification(
  intent: NotifyKey,
  getConnection?: Conn,
): Promise<"claimed" | "duplicate"> {
  return withConn(async (connection) => {
    try {
      await connection.execute(
        `INSERT INTO marathon_notifications
          (marathon_id, user_id, day_number, kind, channel, delivered)
         VALUES (?, ?, ?, ?, ?, 0)`,
        notifyKeyParams(intent),
      );
      return "claimed";
    } catch (error) {
      const errno = (error as { errno?: number }).errno;
      if (errno !== 1062) throw error;
    }
    const stale = await connection.execute(
      `UPDATE marathon_notifications
       SET sent_at = CURRENT_TIMESTAMP
       WHERE marathon_id = ? AND user_id = ? AND day_number = ? AND kind = ? AND channel = ?
         AND delivered = 0
         AND sent_at < DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ${STALE_NOTIFICATION_CLAIM_MINUTES} MINUTE)`,
      notifyKeyParams(intent),
    );
    return stale.affectedRows === 1 ? "claimed" : "duplicate";
  }, getConnection);
}

/** Marks a claim as delivered so it is never retried. */
export async function confirmNotification(
  intent: NotifyKey,
  getConnection?: Conn,
): Promise<void> {
  await withConn(async (connection) => {
    await connection.execute(
      `UPDATE marathon_notifications
       SET delivered = 1
       WHERE marathon_id = ? AND user_id = ? AND day_number = ? AND kind = ? AND channel = ?`,
      notifyKeyParams(intent),
    );
  }, getConnection);
}

export async function releaseNotification(
  intent: NotifyKey,
  getConnection?: Conn,
): Promise<void> {
  await withConn(async (connection) => {
    await connection.execute(
      `DELETE FROM marathon_notifications
       WHERE marathon_id = ? AND user_id = ? AND day_number = ? AND kind = ? AND channel = ?`,
      notifyKeyParams(intent),
    );
  }, getConnection);
}
