"use server";

import { redirect } from "next/navigation";

import { safeInternalPath } from "@/lib/safeInternalPath";
import { claimGuestProgress } from "@/modules/diagnostic/claimGuestProgress";
import { clearGuestCookie } from "./guestToken";
import { verifyPassword } from "./password";
import {
  clearSessionCookie,
  renewSessionCookie,
  requireUser,
  revokeCurrentLoginSession,
  setSessionCookie,
} from "./getCurrentUser";
import { changePassword, ChangePasswordError } from "./changePassword";
import type { ChangePasswordErrorCode } from "./changePassword";
import {
  createUser,
  CreateUserError,
  findUserByEmail,
  findUserById,
  findUserByLogin,
  markEmailVerified,
  updateUserPassword,
} from "./users";
import { recordLoginPresence } from "./presence";
import {
  consumeAuthToken,
  countRecentAuthTokens,
} from "./authTokens";
import {
  sendEmailVerificationMail,
  sendPasswordResetMail,
  sendRegistrationVerificationMail,
} from "./emailMessages";
import { needsEmailVerification } from "./needsEmailVerification";
import {
  removeAvatar,
  uploadAvatar,
  UploadAvatarError,
  type UploadAvatarErrorCode,
} from "./avatar/upload";
import { revalidatePath } from "next/cache";
import type { AuthUser } from "./types";
import {
  loginUserSchema,
  requestResetEmailSchema,
  resetPasswordErrorCode,
  resetPasswordSchema,
} from "@/validations/authValidation";
import { validateSchema } from "@/validations/parse";
import {
  validateRegistrationInput,
  type RegistrationFieldError,
} from "./validateRegistration";

export type LoginErrorCode =
  | "requiredFields"
  | "invalidCredentials"
  | "accountBanned"
  | "emailUnverified";

export type LoginActionState =
  | { status: "idle" }
  | { status: "error", code: LoginErrorCode };

export type RegisterActionState =
  | { status: "idle" }
  | { status: "error", code: RegistrationFieldError | "serverError" };

export async function loginAction(
  _prev: LoginActionState,
  formData: FormData,
): Promise<LoginActionState> {
  const parsed = validateSchema(loginUserSchema, {
    login: String(formData.get("login") ?? ""),
    password: String(formData.get("password") ?? ""),
  });
  if (!parsed.ok) {
    if (parsed.detail.type === "string.max") {
      return { status: "error", code: "invalidCredentials" };
    }
    return { status: "error", code: "requiredFields" };
  }
  const { login, password } = parsed.value;
  const nextPath = safeInternalPath(formData.get("next"));

  const user = await findUserByLogin(login);

  if (!user || !verifyPassword(password, user.passwordHash)) {
    return { status: "error", code: "invalidCredentials" };
  }

  if (user.isBanned) {
    return { status: "error", code: "accountBanned" };
  }

  if (needsEmailVerification(user)) {
    return { status: "error", code: "emailUnverified" };
  }

  await recordLoginPresence(user.id);
  try {
    const { cancelDeletionOnLogin } = await import("@/modules/admin-profiles/accountDeletion");
    const { getConnection } = await import("@/lib/db/mysql");
    await cancelDeletionOnLogin(user.id, { getConnection });
  } catch (error) {
    console.error("login: cancel scheduled deletion failed", error);
  }
  await setSessionCookie(user);
  redirect(nextPath);
}

/**
 * Public self-registration. Creates a student or teacher, sends verify email,
 * does **not** open a session until the email is confirmed.
 * Paid teacher checkout (`/register/teacher`) is hidden for now.
 */
type RegisterActionDeps = {
  createUser?: typeof createUser;
  sendVerificationMail?: typeof sendRegistrationVerificationMail;
  claimGuestProgress?: typeof claimGuestProgress;
  clearGuestCookie?: typeof clearGuestCookie;
  redirectTo?: (path: string) => never;
};

export async function registerAction(
  _prev: RegisterActionState,
  formData: FormData,
  deps: RegisterActionDeps = {},
): Promise<RegisterActionState> {
  const validated = validateRegistrationInput({
    login: String(formData.get("login") ?? ""),
    displayName: String(formData.get("displayName") ?? ""),
    email: String(formData.get("email") ?? ""),
    password: String(formData.get("password") ?? ""),
    passwordConfirm: String(formData.get("passwordConfirm") ?? ""),
  });

  if (!validated.ok) {
    return { status: "error", code: validated.code };
  }

  const roleRaw = String(formData.get("role") ?? "student").trim();
  const role = roleRaw === "teacher" ? "teacher" : "student";

  const create = deps.createUser ?? createUser;
  let userId: number;
  try {
    const user = await create({
      login: validated.value.login,
      displayName: validated.value.displayName,
      email: validated.value.email,
      password: validated.value.password,
      role,
    });
    userId = user.id;
  } catch (error) {
    if (error instanceof CreateUserError && error.code === "login_taken") {
      return { status: "error", code: "loginTaken" };
    }
    if (error instanceof CreateUserError && error.code === "email_taken") {
      return { status: "error", code: "emailTaken" };
    }
    console.error("registerAction: unexpected error", error);
    return { status: "error", code: "serverError" };
  }

  if (role === "student" && formData.get("from") === "diagnostic") {
    try {
      const claim = deps.claimGuestProgress ?? claimGuestProgress;
      const result = await claim(userId);
      if (result.claimed) {
        const clearGuest = deps.clearGuestCookie ?? clearGuestCookie;
        await clearGuest();
      }
    } catch (error) {
      console.error("registerAction: claimGuestProgress failed", error);
    }
  }

  let mailed = false;
  try {
    const send = deps.sendVerificationMail ?? sendRegistrationVerificationMail;
    const result = await send({
      userId,
      email: validated.value.email,
      displayName: validated.value.displayName,
    });
    mailed = result.ok;
  } catch (error) {
    console.error("registerAction: send verify mail failed", error);
  }

  const checkEmail = `/register/check-email?email=${encodeURIComponent(validated.value.email)}`;
  const destination = mailed ? checkEmail : `${checkEmail}&mail=failed`;
  if (deps.redirectTo) return deps.redirectTo(destination);
  redirect(destination);
}

export async function logoutAction(): Promise<void> {
  try {
    await revokeCurrentLoginSession();
  } catch (error) {
    console.error("logoutAction: session revoke failed", error);
  }
  await clearSessionCookie();
  redirect("/login");
}

export type ChangePasswordActionState =
  | { status: "idle" }
  | { status: "ok" }
  | { status: "error", code: ChangePasswordErrorCode };

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

/**
 * Re-issues the session cookie with displayName/login for legacy tokens.
 * Safe to call repeatedly; no-ops when the cookie is already upgraded.
 */
export async function upgradeSessionCookieAction(): Promise<{ ok: boolean }> {
  const { getSessionPayload } = await import("./getCurrentUser");
  const payload = await getSessionPayload();
  if (!payload) return { ok: false };
  if (payload.displayName && payload.login) return { ok: true };

  const user = await findUserById(payload.userId);
  if (!user || user.isBanned) return { ok: false };
  const ok = await renewSessionCookie(user);
  return { ok };
}

export type UploadAvatarActionState =
  | { status: "idle" }
  | { status: "ok" }
  | { status: "error", code: UploadAvatarErrorCode };

function profileWithoutAvatar(user: AuthUser): AuthUser {
  return {
    id: user.id,
    login: user.login,
    displayName: user.displayName,
    role: user.role,
    email: user.email,
    emailVerified: user.emailVerified,
    isBanned: user.isBanned,
  };
}

export async function uploadAvatarAction(
  _prev: UploadAvatarActionState,
  formData: FormData,
): Promise<UploadAvatarActionState> {
  const user = await requireUser();

  try {
    const avatarRev = await uploadAvatar({
      user,
      file: formData.get("avatar"),
    });
    const renewed = await renewSessionCookie({ ...user, avatarRev });
    if (!renewed) {
      console.error(
        "uploadAvatarAction: renewSessionCookie failed after a successful upload",
      );
    }
    revalidatePath("/", "layout");
    return { status: "ok" };
  } catch (error) {
    if (error instanceof UploadAvatarError) {
      return { status: "error", code: error.code };
    }
    console.error("uploadAvatarAction: unexpected error", error);
    return { status: "error", code: "serverError" };
  }
}

export async function removeAvatarAction(
  _prev: UploadAvatarActionState,
  _formData: FormData,
): Promise<UploadAvatarActionState> {
  const user = await requireUser();

  try {
    await removeAvatar(user);
    const renewed = await renewSessionCookie(profileWithoutAvatar(user));
    if (!renewed) {
      console.error(
        "removeAvatarAction: renewSessionCookie failed after a successful removal",
      );
    }
    revalidatePath("/", "layout");
    return { status: "ok" };
  } catch (error) {
    if (error instanceof UploadAvatarError) {
      return { status: "error", code: error.code };
    }
    console.error("removeAvatarAction: unexpected error", error);
    return { status: "error", code: "serverError" };
  }
}

export type ResendVerifyActionState =
  | { status: "idle" }
  | { status: "ok" }
  | { status: "error", code: "invalid_email" | "rate_limited" | "generic" };

export async function resendVerificationAction(
  _prev: ResendVerifyActionState,
  formData: FormData,
): Promise<ResendVerifyActionState> {
  const parsed = validateSchema(requestResetEmailSchema, {
    email: String(formData.get("email") ?? ""),
  });
  if (!parsed.ok) return { status: "error", code: "invalid_email" };
  const { email } = parsed.value;

  const user = await findUserByEmail(email);
  if (!user || user.emailVerified || user.isBanned) {
    return { status: "ok" };
  }

  const recent = await countRecentAuthTokens(
    user.id,
    "email_verify",
    15 * 60 * 1000,
  );
  if (recent >= 3) {
    return { status: "error", code: "rate_limited" };
  }

  try {
    const mailed = await sendEmailVerificationMail({
      userId: user.id,
      email: user.email ?? email,
      displayName: user.displayName,
    });
    if (!mailed.ok) return { status: "error", code: "generic" };
  } catch (error) {
    console.error("resendVerificationAction failed", error);
    return { status: "error", code: "generic" };
  }
  return { status: "ok" };
}

export type VerifyEmailActionState =
  | { status: "ok" }
  | { status: "error"; code: "invalid" | "expired" | "used" | "generic" };

/** Call from the client (or a Route Handler). Cookie writes fail in RSC render. */
export async function verifyEmailAction(
  token: string,
): Promise<VerifyEmailActionState> {
  try {
    const consumed = await consumeAuthToken(token, "email_verify");
    if (!consumed.ok) {
      // Strict Mode / email prefetch can consume the token twice in one click.
      // If the account is already verified, treat a reused link as success.
      if (consumed.code === "used" && consumed.userId) {
        const user = await findUserById(consumed.userId);
        if (user?.emailVerified && !user.isBanned) {
          await recordLoginPresence(user.id);
          await setSessionCookie(user);
          return { status: "ok" };
        }
      }
      return { status: "error", code: consumed.code };
    }
    await markEmailVerified(consumed.userId);
    const user = await findUserById(consumed.userId);
    if (user && !user.isBanned) {
      await recordLoginPresence(user.id);
      await setSessionCookie(user);
    }
    return { status: "ok" };
  } catch (error) {
    console.error("verifyEmailAction failed", error);
    return { status: "error", code: "generic" };
  }
}

export type ForgotPasswordActionState =
  | { status: "idle" }
  | { status: "ok" }
  | { status: "error", code: "invalid_email" | "rate_limited" | "generic" };

export async function forgotPasswordAction(
  _prev: ForgotPasswordActionState,
  formData: FormData,
): Promise<ForgotPasswordActionState> {
  const parsed = validateSchema(requestResetEmailSchema, {
    email: String(formData.get("email") ?? ""),
  });
  if (!parsed.ok) return { status: "error", code: "invalid_email" };
  const { email } = parsed.value;

  const user = await findUserByEmail(email);
  if (!user || user.isBanned || !user.emailVerified) {
    return { status: "ok" };
  }

  const recent = await countRecentAuthTokens(
    user.id,
    "password_reset",
    15 * 60 * 1000,
  );
  if (recent >= 3) {
    return { status: "error", code: "rate_limited" };
  }

  try {
    const mailed = await sendPasswordResetMail({
      userId: user.id,
      email: user.email ?? email,
      displayName: user.displayName,
    });
    if (!mailed.ok) return { status: "error", code: "generic" };
  } catch (error) {
    console.error("forgotPasswordAction failed", error);
    return { status: "error", code: "generic" };
  }
  return { status: "ok" };
}

export type ResetPasswordActionState =
  | { status: "idle" }
  | { status: "ok" }
  | {
      status: "error";
      code:
        | "invalid_token"
        | "expired"
        | "used"
        | "passwordTooShort"
        | "passwordTooLong"
        | "passwordMismatch"
        | "generic";
    };

export async function resetPasswordAction(
  _prev: ResetPasswordActionState,
  formData: FormData,
): Promise<ResetPasswordActionState> {
  const parsed = validateSchema(resetPasswordSchema, {
    token: String(formData.get("token") ?? ""),
    password: String(formData.get("password") ?? ""),
    passwordConfirm: String(formData.get("passwordConfirm") ?? ""),
  });
  if (!parsed.ok) {
    return { status: "error", code: resetPasswordErrorCode(parsed.detail) };
  }
  const { token, password } = parsed.value;

  try {
    const consumed = await consumeAuthToken(token, "password_reset");
    if (!consumed.ok) {
      if (consumed.code === "expired") {
        return { status: "error", code: "expired" };
      }
      if (consumed.code === "used") {
        return { status: "error", code: "used" };
      }
      return { status: "error", code: "invalid_token" };
    }
    await updateUserPassword(consumed.userId, password);
    return { status: "ok" };
  } catch (error) {
    console.error("resetPasswordAction failed", error);
    return { status: "error", code: "generic" };
  }
}
