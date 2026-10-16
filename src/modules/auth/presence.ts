import "server-only";

import type { SqlConnection } from "@/lib/db/mysql";
import { ONLINE_WINDOW_MS } from "./presenceRules";
import { ensureAuthSchema } from "./users";

/**
 * Kept for callers that only have a timestamp. The admin list does not use
 * this: a future-shifted MySQL `Date` used to stay "online" for hours, and
 * logout never cleared it. Online is a live `user_sessions` row.
 */
export const ONLINE_THRESHOLD_MS = ONLINE_WINDOW_MS;

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

export function isUserOnline(
  lastSeenAt: string | Date | null | undefined,
  nowMs = Date.now(),
): boolean {
  if (!lastSeenAt) return false;
  const seen =
    lastSeenAt instanceof Date ? lastSeenAt : new Date(lastSeenAt);
  if (Number.isNaN(seen.getTime())) return false;
  const age = nowMs - seen.getTime();
  return age >= 0 && age <= ONLINE_THRESHOLD_MS;
}

/**
 * Heartbeat / soft-nav presence. Skips write if already touched recently
 * to keep MySQL load low under many open tabs.
 */
export async function touchLastSeen(
  userId: number,
  deps: { getConnection: () => Promise<SqlConnection> } = {
    getConnection: loadDefaultConnection,
  },
): Promise<void> {
  if (!Number.isInteger(userId) || userId <= 0) return;

  await ensureAuthSchema(deps);
  const connection = await deps.getConnection();
  try {
    await connection.execute(
      `UPDATE app_users
       SET last_seen_at = CURRENT_TIMESTAMP
       WHERE id = ?
         AND (
           last_seen_at IS NULL
           OR last_seen_at < (CURRENT_TIMESTAMP - INTERVAL 30 SECOND)
         )`,
      [userId],
    );
  } finally {
    connection.release();
  }
}

/** Called on successful password / demo login. */
export async function recordLoginPresence(
  userId: number,
  deps: { getConnection: () => Promise<SqlConnection> } = {
    getConnection: loadDefaultConnection,
  },
): Promise<void> {
  if (!Number.isInteger(userId) || userId <= 0) return;

  await ensureAuthSchema(deps);
  const connection = await deps.getConnection();
  try {
    await connection.execute(
      `UPDATE app_users
       SET last_login_at = CURRENT_TIMESTAMP,
           last_seen_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [userId],
    );
  } finally {
    connection.release();
  }
}
