import "server-only";

import { getSessionPayload } from "@/modules/auth/getCurrentUser";
import { getGuestId, getOrCreateGuestId } from "@/modules/auth/guestToken";

/**
 * Owner resolution runs on every diagnostic answer, so it reads the id from the
 * signed session cookie instead of loading the `app_users` row: the queries it
 * feeds all filter by `user_id`, and only the id is ever used here.
 */
async function sessionUserId(): Promise<number | null> {
  const payload = await getSessionPayload();
  return payload?.userId ?? null;
}

/**
 * Identity for a diagnostic attempt: exactly one of `userId`/`guestToken` is
 * set, never both. Authenticated students never touch the guest cookie.
 */
export type SessionOwner =
  | { userId: number; guestToken: null }
  | { userId: null; guestToken: string };

export function isValidOwner(value: unknown): value is SessionOwner {
  if (typeof value !== "object" || value === null) return false;
  const { userId, guestToken } = value as Record<string, unknown>;
  const hasUser =
    typeof userId === "number" && Number.isInteger(userId) && userId > 0;
  const hasGuest = typeof guestToken === "string" && guestToken.length > 0;
  return (hasUser && guestToken === null) || (hasGuest && userId === null);
}

/**
 * Resolves the caller's identity for a write (self-score insert, session
 * start, answer/finish). Mints a fresh signed guest cookie if the visitor
 * is unauthenticated and has none yet (or an invalid/tampered one).
 */
export async function resolveOwnerForWrite(): Promise<SessionOwner> {
  const userId = await sessionUserId();
  if (userId !== null) {
    return { userId, guestToken: null };
  }
  const guestToken = await getOrCreateGuestId();
  return { userId: null, guestToken };
}

/**
 * Resolves the caller's identity for a read (the diagnostic session page).
 * Never mints a cookie — an absent/invalid guest cookie resolves to `null`
 * so the caller can respond with `notFound()` instead of silently creating
 * a new, empty guest identity mid-render.
 */
export async function resolveOwnerForRead(): Promise<SessionOwner | null> {
  const userId = await sessionUserId();
  if (userId !== null) {
    return { userId, guestToken: null };
  }
  const guestToken = await getGuestId();
  return guestToken ? { userId: null, guestToken } : null;
}

/** Two-branch ownership WHERE fragment, usable with any table alias that has
 * `user_id`/`guest_token` columns. Pass the matching 4 params via
 * `ownerParams`. */
export function ownerClause(alias: string): string {
  return `((? IS NOT NULL AND ${alias}.user_id = ?) OR (? IS NOT NULL AND ${alias}.guest_token = ? AND ${alias}.user_id IS NULL))`;
}

export function ownerParams(owner: SessionOwner): [unknown, unknown, unknown, unknown] {
  return [owner.userId, owner.userId, owner.guestToken, owner.guestToken];
}

/** Stable per-owner key for the duplicate-start-in-progress guard. */
export function ownerKey(owner: SessionOwner): string {
  return owner.userId !== null ? `user:${owner.userId}` : `guest:${owner.guestToken}`;
}
