import "server-only";

import type { SqlConnection } from "@/lib/db/mysql";
import { hashAuthToken } from "@/modules/auth/authTokens";
import { validateParentInviteToken } from "@/validations/parentInviteValidation";

export type GetParentInviteResult =
  | { valid: true; childName: string }
  | { valid: false };

type InviteRow = {
  used_at: Date | string | null;
  revoked_at: Date | string | null;
  unexpired: number;
  student_role: string;
  is_banned: number;
  display_name: string | null;
};

async function loadConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

/** Read-only preview. Registration must recheck the invitation in its transaction. */
export async function getParentInvite(
  rawToken: unknown,
  deps: { getConnection: () => Promise<SqlConnection> } = { getConnection: loadConnection },
): Promise<GetParentInviteResult> {
  const parsed = validateParentInviteToken(rawToken);
  if (!parsed.ok) return { valid: false };

  let connection: SqlConnection | undefined;
  try {
    connection = await deps.getConnection();
    const rows = await connection.query<InviteRow>(
      `SELECT pi.used_at, pi.revoked_at, u.display_name,
              (pi.expires_at > CURRENT_TIMESTAMP) AS unexpired,
              u.role AS student_role, u.is_banned
       FROM parent_invites pi
       INNER JOIN app_users u ON u.id = pi.student_user_id
       WHERE pi.token_hash = ?
       LIMIT 1`,
      [hashAuthToken(parsed.token)],
    );
    const row = rows[0];
    const valid = !!row && row.used_at === null && row.revoked_at === null
      && row.unexpired === 1 && row.student_role === "student" && row.is_banned === 0;
    if (!valid || !row) return { valid: false };
    return { valid: true, childName: row.display_name?.trim() || "—" };
  } catch {
    // Same public result for missing invitations and failures. Never log tokens/SQL errors.
    return { valid: false };
  } finally {
    connection?.release();
  }
}
