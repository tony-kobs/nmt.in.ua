"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { findUserById } from "@/modules/auth/users";
import { setSessionCookie } from "@/modules/auth/getCurrentUser";
import {
  isAllowedWayForPayCheckoutUrl,
  isTeacherPaymentReference,
  TEACHER_PAY_COOKIE,
  TEACHER_PAY_COOKIE_MAX_AGE_SEC,
} from "./constants";
import { startTeacherRegistration } from "./startTeacherRegistration";
import type { RegisterTeacherErrorCode } from "./startTeacherRegistration";
import { resolveBypassReference } from "./bypassReference";
import { findTeacherPaymentByReference } from "./teacherPayments";
import {
  isTeacherPaymentTestBypassEnabled,
  simulateTeacherPaymentSuccess,
  type SimulateTeacherPaymentErrorCode,
} from "./testBypass";
import type { WayForPayCheckout } from "./wayforpayClient";

export type RegisterTeacherActionState =
  | { status: "idle" }
  | { status: "error"; code: RegisterTeacherErrorCode; reference?: string }
  | { status: "pay"; checkout: WayForPayCheckout };

function errorState(
  code: RegisterTeacherErrorCode,
  reference?: string,
): Extract<RegisterTeacherActionState, { status: "error" }> {
  if (reference && isTeacherPaymentReference(reference)) {
    return { status: "error", code, reference: reference.trim() };
  }
  return { status: "error", code };
}

export type { RegisterTeacherErrorCode };

async function setTeacherPayCookie(reference: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(TEACHER_PAY_COOKIE, reference, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TEACHER_PAY_COOKIE_MAX_AGE_SEC,
  });
}

export async function registerTeacherAction(
  _prev: RegisterTeacherActionState,
  formData: FormData,
): Promise<RegisterTeacherActionState> {
  const result = await startTeacherRegistration({
    login: String(formData.get("login") ?? ""),
    displayName: String(formData.get("displayName") ?? ""),
    password: String(formData.get("password") ?? ""),
    passwordConfirm: String(formData.get("passwordConfirm") ?? ""),
  });

  if (!result.ok) {
    if (result.reference) {
      try {
        await setTeacherPayCookie(result.reference);
      } catch (error) {
        console.error("registerTeacherAction: cookie failed", error);
      }
    }
    return errorState(result.code, result.reference);
  }

  try {
    await setTeacherPayCookie(result.reference);
  } catch (error) {
    console.error("registerTeacherAction: cookie failed", error);
  }

  if (!isAllowedWayForPayCheckoutUrl(result.checkout.actionUrl)) {
    return errorState("invoiceFailed", result.reference);
  }

  // Client auto-submits a POST form. CSP allows https://secure.wayforpay.com
  // (Purchase is a form POST, not a GET invoice URL).
  return { status: "pay", checkout: result.checkout };
}

export async function claimTeacherSessionAction(
  reference: string,
): Promise<{ ok: boolean }> {
  if (!isTeacherPaymentReference(reference)) {
    return { ok: false };
  }
  const payment = await findTeacherPaymentByReference(reference.trim());
  if (!payment || payment.status !== "paid" || !payment.userId) {
    return { ok: false };
  }
  const user = await findUserById(payment.userId);
  if (!user || user.role !== "teacher") {
    return { ok: false };
  }
  await setSessionCookie(user);
  return { ok: true };
}

export async function readTeacherPayReferenceFromCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  const value = cookieStore.get(TEACHER_PAY_COOKIE)?.value;
  if (!value || !isTeacherPaymentReference(value)) return null;
  return value.trim();
}

/** Cookie reference when bypass is allowed and the row is still pending. */
export async function readPendingTeacherPayReferenceForTestBypass(): Promise<
  string | null
> {
  if (!isTeacherPaymentTestBypassEnabled()) return null;
  const reference = await readTeacherPayReferenceFromCookie();
  if (!reference) return null;
  const payment = await findTeacherPaymentByReference(reference);
  return payment?.status === "pending" ? reference : null;
}

export type SimulateTeacherPaymentActionState =
  | { status: "idle" }
  | { status: "error"; code: SimulateTeacherPaymentErrorCode };

async function clearTeacherPayCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(TEACHER_PAY_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

/**
 * Dev/sandbox only: pretend WayForPay returned Approved, then sign in as the
 * new teacher. Disabled for a live merchant in production.
 */
export async function simulateTeacherPaymentSuccessAction(
  _prev: SimulateTeacherPaymentActionState,
  formData: FormData,
): Promise<SimulateTeacherPaymentActionState> {
  if (!isTeacherPaymentTestBypassEnabled()) {
    return { status: "error", code: "disabled" };
  }

  const cookieRef = await readTeacherPayReferenceFromCookie();
  const reference = resolveBypassReference(
    cookieRef,
    String(formData.get("reference") ?? ""),
  );
  const result = await simulateTeacherPaymentSuccess({ reference });
  if (!result.ok) {
    return { status: "error", code: result.code };
  }

  await setSessionCookie(result.user);
  try {
    await clearTeacherPayCookie();
  } catch (error) {
    console.error("simulateTeacherPaymentSuccessAction: cookie clear failed", error);
  }
  redirect("/");
}
