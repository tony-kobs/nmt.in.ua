/** Online window. Compared in SQL against `CURRENT_TIMESTAMP`, same clock as the write. */
export const ONLINE_WINDOW_MINUTES = 5;
export const ONLINE_WINDOW_MS = ONLINE_WINDOW_MINUTES * 60 * 1000;

/** Skip a presence write when this session was touched more recently than this. */
export const PRESENCE_TOUCH_GAP_SEC = 60;

export type PresenceAgo =
  | { kind: "never" }
  | { kind: "just" }
  | { kind: "minutes"; count: number }
  | { kind: "hours"; count: number };

/**
 * Live only when the login row is still open, not past `expires_at`,
 * and the last activity is inside the window. A future or missing stamp
 * is not enough on its own.
 */
export function isLivePresence(input: {
  revoked: boolean;
  expiresAtMs: number;
  lastSeenAtMs: number | null;
  nowMs: number;
}): boolean {
  if (input.revoked) return false;
  if (!(input.expiresAtMs > input.nowMs)) return false;
  if (input.lastSeenAtMs == null || Number.isNaN(input.lastSeenAtMs)) {
    return false;
  }
  const age = input.nowMs - input.lastSeenAtMs;
  return age >= 0 && age <= ONLINE_WINDOW_MS;
}

export function presenceAgo(minutes: number | null | undefined): PresenceAgo {
  if (minutes == null || !Number.isFinite(minutes)) return { kind: "never" };
  if (minutes < 1) return { kind: "just" };
  const whole = Math.floor(minutes);
  if (whole < 60) return { kind: "minutes", count: whole };
  return { kind: "hours", count: Math.floor(whole / 60) };
}

/** Correlated predicate for admin profile queries. `userIdExpr` is SQL, not user input. */
export function onlineSessionExistsSql(userIdExpr = "app_users.id"): string {
  return `EXISTS (
    SELECT 1 FROM user_sessions s
    WHERE s.user_id = ${userIdExpr}
      AND s.revoked_at IS NULL
      AND s.expires_at > CURRENT_TIMESTAMP
      AND s.last_seen_at >= (CURRENT_TIMESTAMP - INTERVAL ${ONLINE_WINDOW_MINUTES} MINUTE)
  )`;
}
