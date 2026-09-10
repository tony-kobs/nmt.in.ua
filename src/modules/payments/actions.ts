"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { findUserById } from "@/modules/auth/users";
import { setSessionCookie } from "@/modules/auth/getCurrentUser";
import {
  isTeacherPaymentReference,
  TEACHER_PAY_COOKIE,
  TEACHER_PAY_COOKIE_MAX_AGE_SEC,
} from "./constants";
import { startTeacherRegistration } from "./startTeacherRegistration";
import type { RegisterTeacherErrorCode } from "./startTeacherRegistration";
import { findTeacherPaymentByReference } from "./teacherPayments";

export type RegisterTeacherActionState =
  | { status: "idle" }
  | { status: "error"; code: RegisterTeacherErrorCode };

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
    return { status: "error", code: result.code };
  }

  try {
    await setTeacherPayCookie(result.reference);
  } catch (error) {
    console.error("registerTeacherAction: cookie failed", error);
  }

  redirect(result.pageUrl);
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
