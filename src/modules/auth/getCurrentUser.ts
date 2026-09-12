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

/** Redirects to /login when unauthenticated. */
export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
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
  return payload.userId;
}

export async function requireRole(roles: UserRole[]): Promise<AuthUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    redirect("/");
  }
  return user;
}

export async function setSessionCookie(user: AuthUser): Promise<void> {
  const token = await createSessionToken({
    userId: user.id,
    role: user.role,
    displayName: user.displayName,
    login: user.login,
    avatarRev: user.avatarRev,
  });
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  });
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
    },
    payload.exp,
  );
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: remainingSec,
  });
  return true;
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
