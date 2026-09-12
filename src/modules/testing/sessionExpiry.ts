/**
 * Fixed, non-sliding 24h lifetime for `task_sessions` rows. Shared by
 * `src/modules/testing/*` and `src/modules/diagnostic/*` — the same table,
 * the same rule, regardless of session_type.
 *
 * The deadline is set once, at row creation (`computeSessionDeadline`), and
 * never reset — activating a planned row or marking it started must not
 * touch it. A completed session is never checked against its deadline
 * (results and read-only retries stay readable forever); an active session
 * past its deadline rejects further reads/writes instead of being
 * auto-completed.
 */

/** Unix seconds. Reused as a literal (86400) in test assertions per the
 * task's requirement, not only via this constant. */
export const SESSION_LIFETIME_SEC = 60 * 60 * 24;

/** `nowSec + SESSION_LIFETIME_SEC` — call once, at creation, with the same
 * clock already used for the row's other unix-second columns. */
export function computeSessionDeadline(nowSec: number): number {
  return nowSec + SESSION_LIFETIME_SEC;
}

/**
 * Fails closed: a missing, zero, or otherwise non-finite deadline counts as
 * expired rather than "never expires". A legacy row that somehow slipped
 * through the migration backfill must not grant unlimited active access.
 */
export function isSessionExpired(
  deadline: number | null | undefined,
  nowSec: number,
): boolean {
  if (
    deadline == null ||
    !Number.isFinite(deadline) ||
    deadline <= 0
  ) {
    return true;
  }
  return nowSec >= deadline;
}
