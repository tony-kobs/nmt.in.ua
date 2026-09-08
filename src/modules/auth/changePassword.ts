import type { SqlConnection } from "@/lib/db/mysql";
import type { AuthUser } from "./types";
import { isDemoAccountLogin } from "./demoLogin";
import { verifyPassword } from "./password";
import { findUserByLogin, updateUserPassword } from "./users";
import { validateChangePasswordInput } from "./validateChangePassword";

export type ChangePasswordErrorCode =
  | "requiredFields"
  | "passwordTooShort"
  | "passwordTooLong"
  | "passwordMismatch"
  | "samePassword"
  | "wrongCurrent"
  | "demoAccount"
  | "serverError";

export class ChangePasswordError extends Error {
  constructor(
    message: string,
    public readonly code: ChangePasswordErrorCode,
  ) {
    super(message);
    this.name = "ChangePasswordError";
  }
}

type ChangePasswordDeps = {
  getConnection: () => Promise<SqlConnection>;
};

export type ChangePasswordInput = {
  user: AuthUser;
  currentPassword: string;
  newPassword: string;
  newPasswordConfirm: string;
};

export async function changePassword(
  input: ChangePasswordInput,
  deps?: ChangePasswordDeps,
): Promise<void> {
  if (isDemoAccountLogin(input.user.login)) {
    throw new ChangePasswordError(
      "Demo account passwords cannot be changed.",
      "demoAccount",
    );
  }

  const validated = validateChangePasswordInput({
    currentPassword: input.currentPassword,
    newPassword: input.newPassword,
    newPasswordConfirm: input.newPasswordConfirm,
  });
  if (!validated.ok) {
    throw new ChangePasswordError("Invalid password change payload.", validated.code);
  }

  const stored = await findUserByLogin(input.user.login, deps);
  if (!stored || stored.id !== input.user.id) {
    throw new ChangePasswordError("User not found.", "serverError");
  }

  if (!verifyPassword(validated.value.currentPassword, stored.passwordHash)) {
    throw new ChangePasswordError("Current password does not match.", "wrongCurrent");
  }

  try {
    await updateUserPassword(input.user.id, validated.value.newPassword, deps);
  } catch {
    throw new ChangePasswordError("Database operation failed.", "serverError");
  }
}
