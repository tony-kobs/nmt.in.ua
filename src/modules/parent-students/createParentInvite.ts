import "server-only";

import type { SqlConnection } from "@/lib/db/mysql";
import { absoluteSiteUrl } from "@/lib/siteOrigin";
import { hashAuthToken, mintAuthTokenRaw } from "@/modules/auth/authTokens";
import { optionalLiveUser } from "@/modules/auth/getCurrentUser";
import type { AuthUser } from "@/modules/auth/types";

export const PARENT_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const PARENT_INVITE_WINDOW_MS = 60 * 60 * 1000;
export const PARENT_INVITE_LIMIT = 5;

export type CreateParentInviteResult =
  | { status: "success"; url: string; expiresAt: string }
  | { status: "error"; code: "unauthorized" | "forbidden" | "rate_limited" | "generic" };

type Deps = {
  getUser: () => Promise<AuthUser | null>;
  getConnection: () => Promise<SqlConnection>;
  now: () => number;
};

async function loadConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

/** No client identity input: both owner and issuer come from the live session. */
export async function createParentInvite(
  deps: Deps = { getUser: optionalLiveUser, getConnection: loadConnection, now: Date.now },
): Promise<CreateParentInviteResult> {
  const user = await deps.getUser();
  if (!user) return { status: "error", code: "unauthorized" };
  if (user.isBanned || user.role !== "student" || (user.realRole ?? user.role) !== "student") {
    return { status: "error", code: "forbidden" };
  }

  let connection: SqlConnection | undefined;
  try {
    connection = await deps.getConnection();
    await connection.beginTransaction();
    // Serialize issuance per student, including when no invitations exist yet.
    // Recheck the stored role/ban while holding the same lock as the insert.
    const accounts = await connection.query<{ role: string; is_banned: number }>(
      `SELECT role, is_banned FROM app_users WHERE id = ? FOR UPDATE`,
      [user.id],
    );
    if (!accounts[0] || accounts[0].role !== "student" || accounts[0].is_banned) {
      await connection.rollback();
      return { status: "error", code: "forbidden" };
    }

    const now = deps.now();
    // Count all issues, including used/revoked tokens, so revocation cannot reset the limit.
    const counts = await connection.query<{ count: number | string }>(
      `SELECT COUNT(*) AS count FROM parent_invites
       WHERE created_by_user_id = ? AND created_at >= ?`,
      [user.id, new Date(now - PARENT_INVITE_WINDOW_MS)],
    );
    const count = Number(counts[0]?.count);
    if (!Number.isSafeInteger(count) || count < 0) throw new Error("Invalid invite count");
    if (count >= PARENT_INVITE_LIMIT) {
      await connection.rollback();
      return { status: "error", code: "rate_limited" };
    }

    const rawToken = mintAuthTokenRaw();
    const expiresAt = new Date(now + PARENT_INVITE_TTL_MS);
    const url = absoluteSiteUrl(`/register/parent?token=${encodeURIComponent(rawToken)}`);
    await connection.execute(
      `INSERT INTO parent_invites
         (student_user_id, created_by_user_id, token_hash, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [user.id, user.id, hashAuthToken(rawToken), expiresAt, new Date(now)],
    );
    await connection.commit();
    return { status: "success", url, expiresAt: expiresAt.toISOString() };
  } catch {
    // Do not log raw tokens, URLs, or database errors containing query parameters.
    try { await connection?.rollback(); } catch { /* Preserve the safe error response. */ }
    return { status: "error", code: "generic" };
  } finally {
    connection?.release();
  }
}
