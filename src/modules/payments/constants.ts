/** One-time teacher cabinet fee. Amount sent to Mono is always in kopiyky. */
export const TEACHER_FEE_UAH = 500;
export const TEACHER_FEE_KOPIYKY = 50_000;

/** ISO 4217 numeric code for UAH. */
export const MONO_CCY_UAH = 980;

export const MONO_DEFAULT_BASE_URL = "https://api.monobank.ua";

export const TEACHER_PAY_COOKIE = "nmt_teacher_pay";
export const TEACHER_PAY_COOKIE_MAX_AGE_SEC = 60 * 60;

export const TEACHER_PAYMENT_STATUSES = [
  "pending",
  "paid",
  "failed",
  "expired",
  "cancelled",
] as const;

export type TeacherPaymentStatus = (typeof TEACHER_PAYMENT_STATUSES)[number];

const REFERENCE_PATTERN = /^[a-f0-9]{32}$/i;

export function isTeacherPaymentReference(value: unknown): value is string {
  return typeof value === "string" && REFERENCE_PATTERN.test(value.trim());
}
