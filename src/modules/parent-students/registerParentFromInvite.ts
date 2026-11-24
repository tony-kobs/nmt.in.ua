import "server-only";

import type { SqlConnection } from "@/lib/db/mysql";
import { hashAuthToken } from "@/modules/auth/authTokens";
import { sendRegistrationVerificationMail } from "@/modules/auth/emailMessages";
import { loginCandidatesFromEmail } from "@/modules/auth/loginFromEmail";
import { hashPassword } from "@/modules/auth/password";
import { CreateUserError, insertUserOnConnection } from "@/modules/auth/users";
import { validateRegistrationInput, type RegistrationFieldError } from "@/modules/auth/validateRegistration";
import { validateParentInviteToken } from "@/validations/parentInviteValidation";

export type RegisterParentResult =
  | { status: "success"; email: string; verificationSent: boolean }
  | { status: "error"; code: RegistrationFieldError | "invalidInvite" | "serverError" };

type Deps = {
  getConnection: () => Promise<SqlConnection>;
  sendVerificationMail: typeof sendRegistrationVerificationMail;
};

async function loadConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

/** Creates only a new parent account. Never attaches an existing email/account. */
export async function registerParentFromInvite(
  raw: unknown,
  deps: Deps = { getConnection: loadConnection, sendVerificationMail: sendRegistrationVerificationMail },
): Promise<RegisterParentResult> {
  const fields = typeof raw === "object" && raw !== null ? raw as Record<string, unknown> : {};
  const token = validateParentInviteToken(fields.token);
  if (!token.ok) return { status: "error", code: "invalidInvite" };
  const text = (key: string) => typeof fields[key] === "string" ? fields[key] as string : "";
  const candidates = loginCandidatesFromEmail(text("email").trim());
  const credentials = {
    displayName: text("displayName"), email: text("email"),
    password: text("password"), passwordConfirm: text("passwordConfirm"),
  };
  const validated = validateRegistrationInput({ ...credentials, login: candidates[0] });
  if (!validated.ok) return { status: "error", code: validated.code };
  const validLogins = candidates.filter((login) =>
    validateRegistrationInput({ ...credentials, login }).ok,
  );

  const tokenHash = hashAuthToken(token.token);
  const passwordHash = hashPassword(validated.value.password);
  let connection: SqlConnection | undefined;
  let created: Awaited<ReturnType<typeof insertUserOnConnection>> | undefined;
  try {
    connection = await deps.getConnection();
    // Discover the lock target only. Recheck everything after acquiring locks.
    const initial = await connection.query<{ student_user_id: number }>(
      "SELECT student_user_id FROM parent_invites WHERE token_hash = ? LIMIT 1", [tokenHash],
    );
    if (!initial[0]) return { status: "error", code: "invalidInvite" };
    const studentId = initial[0].student_user_id;
    await connection.beginTransaction();
    // Same lock order as issuance: account first, then invitations.
    const students = await connection.query<{ role: string; is_banned: number }>(
      "SELECT role, is_banned FROM app_users WHERE id = ? FOR UPDATE", [studentId],
    );
    const invitations = await connection.query<{
      id: number; student_user_id: number; used_at: unknown; revoked_at: unknown; unexpired: number;
    }>(
      `SELECT id, student_user_id, used_at, revoked_at,
              (expires_at > CURRENT_TIMESTAMP) AS unexpired
       FROM parent_invites WHERE token_hash = ? LIMIT 1 FOR UPDATE`, [tokenHash],
    );
    const invite = invitations[0];
    const student = students[0];
    if (!invite || invite.student_user_id !== studentId || invite.used_at !== null
      || invite.revoked_at !== null || invite.unexpired !== 1
      || !student || student.role !== "student" || student.is_banned !== 0) {
      await connection.rollback();
      return { status: "error", code: "invalidInvite" };
    }

    for (const login of validLogins) {
      try {
        created = await insertUserOnConnection(connection, {
          login, displayName: validated.value.displayName, email: validated.value.email,
          passwordHash, role: "parent", cabinetScope: "full",
        });
        break;
      } catch (error) {
        if (error instanceof CreateUserError && error.code === "login_taken") continue;
        throw error;
      }
    }
    if (!created) throw new Error("No available login");
    await connection.execute(
      "INSERT INTO parent_students (parent_user_id, student_user_id) VALUES (?, ?)",
      [created.id, studentId],
    );
    const consumed = await connection.execute(
      `UPDATE parent_invites SET used_at = CURRENT_TIMESTAMP, used_by_user_id = ?
       WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL
         AND expires_at > CURRENT_TIMESTAMP`, [created.id, invite.id],
    );
    if (consumed.affectedRows !== 1) throw new Error("Invitation not consumed");
    await connection.commit();
  } catch (error) {
    try { await connection?.rollback(); } catch { /* Return only safe public errors. */ }
    return { status: "error", code: error instanceof CreateUserError && error.code === "email_taken"
      ? "emailTaken" : "serverError" };
  } finally {
    connection?.release();
  }

  // No session here: existing email verification must succeed before sign-in.
  let verificationSent = false;
  try {
    verificationSent = (await deps.sendVerificationMail({
      userId: created.id, email: validated.value.email, displayName: validated.value.displayName,
    })).ok;
  } catch { /* Account is committed; the existing resend action can recover delivery. */ }
  return { status: "success", email: validated.value.email, verificationSent };
}
