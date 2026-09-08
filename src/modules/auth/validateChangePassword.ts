import { PASSWORD_MAX_LEN, PASSWORD_MIN_LEN } from "./validateRegistration";

export type ChangePasswordFieldError =
  | "requiredFields"
  | "passwordTooShort"
  | "passwordTooLong"
  | "passwordMismatch"
  | "samePassword";

export type ChangePasswordInput = {
  currentPassword: string;
  newPassword: string;
  newPasswordConfirm: string;
};

export type ValidatedChangePassword = {
  currentPassword: string;
  newPassword: string;
};

export function validateChangePasswordInput(
  input: ChangePasswordInput,
):
  | { ok: true; value: ValidatedChangePassword }
  | { ok: false; code: ChangePasswordFieldError } {
  const currentPassword = input.currentPassword;
  const newPassword = input.newPassword;
  const newPasswordConfirm = input.newPasswordConfirm;

  if (!currentPassword || !newPassword || !newPasswordConfirm) {
    return { ok: false, code: "requiredFields" };
  }

  if (newPassword.length < PASSWORD_MIN_LEN) {
    return { ok: false, code: "passwordTooShort" };
  }

  if (
    currentPassword.length > PASSWORD_MAX_LEN ||
    newPassword.length > PASSWORD_MAX_LEN
  ) {
    return { ok: false, code: "passwordTooLong" };
  }

  if (newPassword !== newPasswordConfirm) {
    return { ok: false, code: "passwordMismatch" };
  }

  if (currentPassword === newPassword) {
    return { ok: false, code: "samePassword" };
  }

  return { ok: true, value: { currentPassword, newPassword } };
}
