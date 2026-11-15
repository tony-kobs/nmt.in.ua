import "server-only";

import type { SqlConnection } from "@/lib/db/mysql";
import { hashAuthToken } from "@/modules/auth/authTokens";
import { optionalLiveUser } from "@/modules/auth/getCurrentUser";
import type { AuthUser } from "@/modules/auth/types";
import { validateParentInviteToken } from "@/validations/parentInviteValidation";

export type LinkParentInviteResult =
  | { status: "linked" | "already" }
  | { status: "error"; code: "unauthorized" | "forbidden" | "invalidInvite" | "serverError" };

type Deps = {
  getUser: () => Promise<AuthUser | null>;
  getConnection: () => Promise<SqlConnection>;
};

async function loadConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

function isParent(user: AuthUser): boolean {
  return !user.isBanned && user.role === "parent" && (user.realRole ?? user.role) === "parent";
}

/**
 * Attaches the signed-in parent to the invited student. Does not create an
 * account. The parent id comes only from the session.
 */
export async function linkParentFromInvite(
  rawToken: unknown,
  deps: Deps = { getUser: optionalLiveUser, getConnection: loadConnection },
): Promise<LinkParentInviteResult> {
  const token = validateParentInviteToken(rawToken);
  if (!token.ok) return { status: "error", code: "invalidInvite" };
  const user = await deps.getUser();
  if (!user) return { status: "error", code: "unauthorized" };
  if (!isParent(user)) return { status: "error", code: "forbidden" };

  const tokenHash = hashAuthToken(token.token);
  let connection: SqlConnection | undefined;
  try {
    connection = await deps.getConnection();
    const initial = await connection.query<{ student_user_id: number }>(
      "SELECT student_user_id FROM parent_invites WHERE token_hash = ? LIMIT 1",
      [tokenHash],
    );
    if (!initial[0]) return { status: "error", code: "invalidInvite" };
    const studentId = initial[0].student_user_id;
    if (studentId === user.id) return { status: "error", code: "forbidden" };

    await connection.beginTransaction();
    for (const id of [user.id, studentId].sort((a, b) => a - b)) {
      const accounts = await connection.query<{ role: string; is_banned: number }>(
        "SELECT role, is_banned FROM app_users WHERE id = ? FOR UPDATE",
        [id],
      );
      const expected = id === user.id ? "parent" : "student";
      if (!accounts[0] || accounts[0].role !== expected || accounts[0].is_banned !== 0) {
        await connection.rollback();
        return { status: "error", code: "forbidden" };
      }
    }
    const invitations = await connection.query<{
      id: number; student_user_id: number; used_at: unknown; revoked_at: unknown; unexpired: number;
    }>(
      `SELECT id, student_user_id, used_at, revoked_at,
              (expires_at > CURRENT_TIMESTAMP) AS unexpired
       FROM parent_invites WHERE token_hash = ? LIMIT 1 FOR UPDATE`,
      [tokenHash],
    );
    const invite = invitations[0];
    if (!invite || invite.student_user_id !== studentId || invite.used_at !== null
      || invite.revoked_at !== null || invite.unexpired !== 1) {
      await connection.rollback();
      return { status: "error", code: "invalidInvite" };
    }

    let outcome: "linked" | "already" = "linked";
    try {
      await connection.execute(
        "INSERT INTO parent_students (parent_user_id, student_user_id) VALUES (?, ?)",
        [user.id, studentId],
      );
    } catch (error) {
      const errno = (error as { errno?: number }).errno;
      if (errno !== 1062) throw error;
      outcome = "already";
    }
    const consumed = await connection.execute(
      `UPDATE parent_invites SET used_at = CURRENT_TIMESTAMP, used_by_user_id = ?
       WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL
         AND expires_at > CURRENT_TIMESTAMP`,
      [user.id, invite.id],
    );
    if (consumed.affectedRows !== 1) throw new Error("Invitation not consumed");
    await connection.commit();
    return { status: outcome };
  } catch {
    try { await connection?.rollback(); } catch { /* Keep the public error. */ }
    return { status: "error", code: "serverError" };
  } finally {
    connection?.release();
  }
}
