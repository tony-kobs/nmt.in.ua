import "server-only";

import type { SqlConnection } from "@/lib/db/mysql";
import { getGuestId } from "@/modules/auth/guestToken";

// Deliberately touches only ownership columns — `expire_time` (and
// `start_time`/`time`/`session_status`) must survive a claim unchanged. A
// guest's 24h deadline is set once at row creation and a claim is an
// ownership transfer, not a renewal.
const SQL_CLAIM_TASK_SESSIONS = `
  UPDATE task_sessions
  SET user_id = ?, guest_token = NULL
  WHERE guest_token = ? AND user_id IS NULL
`;

const SQL_CLAIM_TASKS2SESSION = `
  UPDATE tasks2session
  SET user_id = ?, guest_token = NULL
  WHERE guest_token = ? AND user_id IS NULL
`;

const SQL_CLAIM_SELF_SCORES = `
  UPDATE user_self_scores
  SET user_id = ?, guest_token = NULL
  WHERE guest_token = ? AND user_id IS NULL
`;

export type ClaimGuestProgressResult = {
  claimed: boolean;
  taskSessions: number;
  taskMappings: number;
  selfScores: number;
};

type ClaimGuestProgressDeps = {
  getConnection: () => Promise<SqlConnection>;
  getGuestToken: () => Promise<string | null>;
};

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

/**
 * Transfers every guest-owned diagnostic row (task_sessions, tasks2session,
 * user_self_scores) to `newUserId`, atomically. Safe to call whenever a
 * user registers — a visitor with no guest cookie, or one with nothing to
 * claim, is a no-op (`claimed: false`).
 *
 * Replay-safe: after a successful claim the matched rows have `user_id` set
 * and `guest_token` cleared, so re-running with the same guest token matches
 * zero rows on any later call. Cross-guest-safe: every UPDATE filters on the
 * exact signed, verified token — a different guest's rows are never
 * touched. The guest cookie itself is only cleared by the caller
 * (`registerAction`) after this resolves without throwing, so a failed
 * claim always leaves the original guest data intact for a future retry.
 */
export async function claimGuestProgress(
  newUserId: number,
  deps: ClaimGuestProgressDeps = {
    getConnection: loadDefaultConnection,
    getGuestToken: getGuestId,
  },
): Promise<ClaimGuestProgressResult> {
  const guestToken = await deps.getGuestToken();
  if (!guestToken) {
    return { claimed: false, taskSessions: 0, taskMappings: 0, selfScores: 0 };
  }

  const connection = await deps.getConnection();
  try {
    await connection.beginTransaction();

    const taskSessions = await connection.execute(SQL_CLAIM_TASK_SESSIONS, [
      newUserId,
      guestToken,
    ]);
    const taskMappings = await connection.execute(SQL_CLAIM_TASKS2SESSION, [
      newUserId,
      guestToken,
    ]);
    const selfScores = await connection.execute(SQL_CLAIM_SELF_SCORES, [
      newUserId,
      guestToken,
    ]);

    await connection.commit();

    return {
      claimed:
        taskSessions.affectedRows > 0 ||
        taskMappings.affectedRows > 0 ||
        selfScores.affectedRows > 0,
      taskSessions: taskSessions.affectedRows,
      taskMappings: taskMappings.affectedRows,
      selfScores: selfScores.affectedRows,
    };
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    console.error("claimGuestProgress: unexpected database error", error);
    throw error;
  } finally {
    connection.release();
  }
}
