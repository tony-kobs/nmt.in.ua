"use server";

import { redirect } from "next/navigation";

import { safeInternalPath } from "@/lib/safeInternalPath";
import { claimGuestProgress } from "@/modules/diagnostic/claimGuestProgress";
import { clearGuestCookie } from "./guestToken";
import { isDemoAccountLogin, isDemoLoginEnabled } from "./demoLogin";
import { verifyPassword } from "./password";
import {
  clearSessionCookie,
  requireUser,
  setSessionCookie,
} from "./getCurrentUser";
import { changePassword, ChangePasswordError } from "./changePassword";
import type { ChangePasswordErrorCode } from "./changePassword";
import { createUser, CreateUserError, findUserByLogin } from "./users";
import {
  PASSWORD_MAX_LEN,
  validateRegistrationInput,
  type RegistrationFieldError,
} from "./validateRegistration";

export type LoginErrorCode = "requiredFields" | "invalidCredentials";

export type LoginActionState =
  | { status: "idle" }
  | { status: "error"; code: LoginErrorCode };

export type RegisterActionState =
  | { status: "idle" }
  | { status: "error"; code: RegistrationFieldError | "serverError" };

export async function loginAction(
  _prev: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const login = String(formData.get("login") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const nextPath = safeInternalPath(formData.get("next"));

  if (!login || !password) {
    return { status: "error", code: "requiredFields" };
  }

  if (password.length > PASSWORD_MAX_LEN) {
    return { status: "error", code: "invalidCredentials" };
  }

  const user = await findUserByLogin(login);

  if (!user || !verifyPassword(password, user.passwordHash)) {
    return { status: "error", code: "invalidCredentials" };
  }

  await setSessionCookie(user);
  redirect(nextPath);
}

/**
 * Public self-registration. Always creates a student account, then signs in.
 * Teacher/admin remain demo-only (or admin-provisioned later).
 */
export async function registerAction(
  _prev: RegisterActionState,
  formData: FormData,
): Promise<RegisterActionState> {
  const nextPath = safeInternalPath(formData.get("next"));
  const validated = validateRegistrationInput({
    login: String(formData.get("login") ?? ""),
    displayName: String(formData.get("displayName") ?? ""),
    password: String(formData.get("password") ?? ""),
    passwordConfirm: String(formData.get("passwordConfirm") ?? ""),
  });

  if (!validated.ok) {
    return { status: "error", code: validated.code };
  }

  let userId: number;
  try {
    const user = await createUser({
      login: validated.value.login,
      displayName: validated.value.displayName,
      password: validated.value.password,
      role: "student",
    });
    await setSessionCookie(user);
    userId = user.id;
  } catch (error) {
    if (error instanceof CreateUserError && error.code === "login_taken") {
      return { status: "error", code: "loginTaken" };
    }
    console.error("registerAction: unexpected error", error);
    return { status: "error", code: "serverError" };
  }

  if (formData.get("from") === "diagnostic") {
    // Best-effort: a failed claim must never block registration, and must
    // leave the guest's data untouched for a retry — so it's logged, not
    // surfaced, and the cookie is only cleared once the claim actually
    // succeeds (claimGuestProgress is a no-op, not an error, when there is
    // no guest cookie or nothing to claim).
    try {
      const result = await claimGuestProgress(userId);
      if (result.claimed) {
        await clearGuestCookie();
      }
    } catch (error) {
      console.error("registerAction: claimGuestProgress failed", error);
    }
  }

  redirect(nextPath);
}

export async function demoLoginAction(
  login: string,
  nextPath = "/",
): Promise<void> {
  if (!isDemoLoginEnabled() || !isDemoAccountLogin(login)) {
    redirect("/login");
  }

  const user = await findUserByLogin(login);
  if (!user) {
    redirect("/login");
  }
  await setSessionCookie(user);
  redirect(safeInternalPath(nextPath));
}

export async function logoutAction(): Promise<void> {
  await clearSessionCookie();
  redirect("/login");
}

export type ChangePasswordActionState =
  | { status: "idle" }
  | { status: "ok" }
  | { status: "error"; code: ChangePasswordErrorCode };

export async function changePasswordAction(
  _prev: ChangePasswordActionState,
  formData: FormData,
): Promise<ChangePasswordActionState> {
  const user = await requireUser();

  try {
    await changePassword({
      user,
      currentPassword: String(formData.get("currentPassword") ?? ""),
      newPassword: String(formData.get("newPassword") ?? ""),
      newPasswordConfirm: String(formData.get("newPasswordConfirm") ?? ""),
    });
    return { status: "ok" };
  } catch (error) {
    if (error instanceof ChangePasswordError) {
      return { status: "error", code: error.code };
    }
    console.error("changePasswordAction: unexpected error", error);
    return { status: "error", code: "serverError" };
  }
}
