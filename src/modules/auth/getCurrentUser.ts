import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import type { AuthUser, UserRole } from "./types";
import {
  createRenewedSessionToken,
  createSessionToken,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SEC,
} from "./sessionToken";
import { findUserById } from "./users";
import { verifySessionToken } from "./sessionToken";
import {
  openLoginSession,
  revokeLoginSession,
  touchLoginSession,
} from "./userSessions";

export async function getSessionPayload() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

function userFromPayload(payload: {
  userId: number;
  role: UserRole;
  displayName: string;
  login: string;
  avatarRev?: number;
}): AuthUser {
  const user: AuthUser = {
    id: payload.userId,
    role: payload.role,
    displayName: payload.displayName,
    login: payload.login,
  };
  if (payload.avatarRev) {
    user.avatarRev = payload.avatarRev;
  }
  return user;
}

/**
 * Returns the logged-in user or null.
 *
 * Prefer displayName/login from the signed cookie (no `app_users` round-trip).
 * Legacy cookies without profile fields fall back to `findUserById`.
 *
 * Memoised per request: layout, `generateMetadata` and the page all ask for the user.
 */
export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const payload = await getSessionPayload();
  if (!payload) return null;

  if (payload.displayName && payload.login) {
    return userFromPayload({
      userId: payload.userId,
      role: payload.role,
      displayName: payload.displayName,
      login: payload.login,
      avatarRev: payload.avatarRev,
    });
  }

  return findUserById(payload.userId);
});

/** True when the cookie is valid but missing profile fields (pre-upgrade tokens). */
export const sessionCookieNeedsUpgrade = cache(async (): Promise<boolean> => {
  const payload = await getSessionPayload();
  if (!payload) return false;
  return !(payload.displayName && payload.login);
});

/** Returns user id or null — for optional auth contexts. */
export async function getCurrentUserId(): Promise<number | null> {
  const user = await getCurrentUser();
  return user?.id ?? null;
}

/**
 * Role and ban from `app_users`, once per request.
 * The signed cookie still identifies the session; it is not the authority.
 */
export const readLiveAccount = cache(async (userId: number): Promise<AuthUser | null> => {
  return findUserById(userId);
});

export function liveUserFromAccount(
  cookieUser: AuthUser,
  account: AuthUser | null,
): { ok: true; user: AuthUser } | { ok: false; reason: "banned" | "missing" } {
  if (!account) return { ok: false, reason: "missing" };
  if (account.isBanned) return { ok: false, reason: "banned" };
  return {
    ok: true,
    user: {
      ...cookieUser,
      role: account.role,
      displayName: account.displayName,
      login: account.login,
      cabinetScope: account.cabinetScope,
      avatarRev: account.avatarRev ?? cookieUser.avatarRev,
      email: account.email,
      emailVerified: account.emailVerified,
      emailVerifyRequired: account.emailVerifyRequired,
      isBanned: false,
    },
  };
}

/**
 * Cookie user whose role and ban were re-read from the database.
 * Missing and banned accounts go to the route that drops the cookie.
 * Returns null when there is no session.
 */
export async function optionalLiveUser(): Promise<AuthUser | null> {
  const cookieUser = await getCurrentUser();
  if (!cookieUser) return null;
  const account = await readLiveAccount(cookieUser.id);
  const decision = liveUserFromAccount(cookieUser, account);
  if (!decision.ok) {
    redirect("/api/auth/clear-session");
  }
  return decision.user;
}

/** Redirects to /login when unauthenticated. Rejects a banned account. */
export async function requireUser(): Promise<AuthUser> {
  const user = await optionalLiveUser();
  if (!user) {
    redirect("/login");
  }
  return user;
}

export async function requireUserId(): Promise<number> {
  const user = await requireUser();
  return user.id;
}

/**
 * User id straight from the signed session cookie — no `app_users` lookup.
 *
 * For hot paths (one Server Action per answered question) where only the id is
 * needed: every query behind them filters by `user_id`, so an id whose row is
 * gone matches nothing instead of leaking another user's data.
 */
export async function requireSessionUserId(): Promise<number> {
  const payload = await getSessionPayload();
  if (!payload) {
    redirect("/login");
  }
  const account = await readLiveAccount(payload.userId);
  if (!account || account.isBanned) {
    redirect("/api/auth/clear-session");
  }
  return payload.userId;
}

export async function requireRole(roles: UserRole[]): Promise<AuthUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    redirect("/");
  }
  return user;
}

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export async function setSessionCookie(user: AuthUser): Promise<void> {
  const nowSec = Math.floor(Date.now() / 1000);
  let sid: number | undefined;
  try {
    const opened = await openLoginSession(user.id, {
      expiresAtSec: nowSec + SESSION_MAX_AGE_SEC,
    });
    sid = opened.id;
  } catch (error) {
    console.error("setSessionCookie: login session was not stored", error);
  }
  const token = await createSessionToken({
    userId: user.id,
    role: user.role,
    displayName: user.displayName,
    login: user.login,
    avatarRev: user.avatarRev,
    sid,
  });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, cookieOptions(SESSION_MAX_AGE_SEC));
}

/**
 * Refreshes the profile fields (displayName/login/avatarRev) in the signed
 * cookie **without** extending its lifetime — the opposite of
 * `setSessionCookie`, which always mints a fresh 24h `exp`. Used for
 * profile-only cookie touches (legacy-token upgrade, avatar change) so those
 * never act as a silent "keep me logged in forever" mechanism.
 *
 * Reads the current, already-verified `exp` from the signed cookie itself —
 * never from client input — via `getSessionPayload` (which already rejects
 * an expired/invalid/missing cookie). Returns `false` without touching the
 * cookie when there is nothing valid to renew; callers must treat that as a
 * rejected update, not fall back to issuing a fresh cookie.
 */
export async function renewSessionCookie(user: AuthUser): Promise<boolean> {
  const payload = await getSessionPayload();
  if (!payload) return false;

  const nowSec = Math.floor(Date.now() / 1000);
  const remainingSec = payload.exp - nowSec;
  if (remainingSec <= 0) return false;

  const token = await createRenewedSessionToken(
    {
      userId: user.id,
      role: user.role,
      displayName: user.displayName,
      login: user.login,
      avatarRev: user.avatarRev,
      sid: payload.sid,
    },
    payload.exp,
  );
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, cookieOptions(remainingSec));
  return true;
}

/** Drops the current login row so the user stops counting as online. */
export async function revokeCurrentLoginSession(): Promise<void> {
  const payload = await getSessionPayload();
  if (!payload?.sid) return;
  await revokeLoginSession(payload.sid, payload.userId);
}

/**
 * Heartbeat for a cookie that predates login rows: open one session that
 * ends at the cookie's existing `exp`, then store its id in the cookie.
 * Cookies that already have `sid` only refresh `last_seen_at`.
 */
export async function ensureCookieLoginSession(): Promise<void> {
  const payload = await getSessionPayload();
  if (!payload) return;
  if (payload.sid) {
    await touchLoginSession(payload.userId, payload.sid);
    return;
  }

  let displayName = payload.displayName;
  let login = payload.login;
  let avatarRev = payload.avatarRev;
  if (!displayName || !login) {
    const user = await findUserById(payload.userId);
    if (!user || user.isBanned) return;
    displayName = user.displayName;
    login = user.login;
    avatarRev = user.avatarRev;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const remainingSec = payload.exp - nowSec;
  if (remainingSec <= 0) return;

  const opened = await openLoginSession(payload.userId, {
    expiresAtSec: payload.exp,
  });
  const token = await createRenewedSessionToken(
    {
      userId: payload.userId,
      role: payload.role,
      displayName,
      login,
      avatarRev,
      sid: opened.id,
    },
    payload.exp,
  );
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, cookieOptions(remainingSec));
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, "", cookieOptions(0));
}
