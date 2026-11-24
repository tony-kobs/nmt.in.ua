import "server-only";

import type { SqlConnection } from "@/lib/db/mysql";
import { absoluteSiteUrl } from "@/lib/siteOrigin";
import { hashAuthToken, mintAuthTokenRaw } from "@/modules/auth/authTokens";
import { optionalLiveUser } from "@/modules/auth/getCurrentUser";
import type { AuthUser } from "@/modules/auth/types";
import { validateParentInviteCreation } from "@/validations/parentInviteCreationValidation";

export const PARENT_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const PARENT_INVITE_WINDOW_MS = 60 * 60 * 1000;
export const PARENT_INVITE_LIMIT = 5;
export const PARENT_TEACHER_INVITE_LIMIT = 50;
export const PARENT_ACTIVE_INVITE_LIMIT = 3;

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

/** Author is session-only; requested target is always authorized inside the transaction. */
export async function createParentInvite(
  input: unknown = {},
  deps: Deps = { getUser: optionalLiveUser, getConnection: loadConnection, now: Date.now },
): Promise<CreateParentInviteResult> {
  const user = await deps.getUser();
  if (!user) return { status: "error", code: "unauthorized" };
  if (user.isBanned || !["student", "teacher"].includes(user.role)
    || (user.realRole ?? user.role) !== user.role) {
    return { status: "error", code: "forbidden" };
  }
  const parsed = validateParentInviteCreation(input);
  if (!parsed.ok) return { status: "error", code: "forbidden" };
  const studentId = user.role === "student" ? user.id : parsed.value.studentId;
  if (!studentId || (user.role === "student" && parsed.value.studentId !== undefined
    && parsed.value.studentId !== user.id) || (user.role === "teacher" && studentId === user.id)) {
    return { status: "error", code: "forbidden" };
  }

  let connection: SqlConnection | undefined;
  try {
    connection = await deps.getConnection();
    await connection.beginTransaction();
    // Lock accounts in a deterministic order, before links and invitations.
    // The author lock serializes their hourly quota across ALL target students.
    for (const id of [...new Set([user.id, studentId])].sort((a, b) => a - b)) {
      const accounts = await connection.query<{ role: string; is_banned: number }>(
        `SELECT role, is_banned FROM app_users WHERE id = ? FOR UPDATE`, [id],
      );
      const expectedRole = id === user.id ? user.role : "student";
      if (!accounts[0] || accounts[0].role !== expectedRole || accounts[0].is_banned) {
        await connection.rollback();
        return { status: "error", code: "forbidden" };
      }
    }
    if (user.role === "teacher") {
      const links = await connection.query<{ teacher_user_id: number }>(
        `SELECT teacher_user_id FROM teacher_students
         WHERE teacher_user_id = ? AND student_user_id = ? LIMIT 1 FOR UPDATE`,
        [user.id, studentId],
      );
      if (!links[0]) {
        await connection.rollback();
        return { status: "error", code: "forbidden" };
      }
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
    const limit = user.role === "teacher" ? PARENT_TEACHER_INVITE_LIMIT : PARENT_INVITE_LIMIT;
    if (count >= limit) {
      await connection.rollback();
      return { status: "error", code: "rate_limited" };
    }
    const activeCounts = await connection.query<{ count: number | string }>(
      `SELECT COUNT(*) AS count FROM parent_invites
       WHERE created_by_user_id = ? AND student_user_id = ?
         AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?`,
      [user.id, studentId, new Date(now)],
    );
    const activeCount = Number(activeCounts[0]?.count);
    if (!Number.isSafeInteger(activeCount) || activeCount < 0) throw new Error("Invalid active invite count");
    if (activeCount >= PARENT_ACTIVE_INVITE_LIMIT) {
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
      [studentId, user.id, hashAuthToken(rawToken), expiresAt, new Date(now)],
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
