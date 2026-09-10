/** One-time teacher cabinet fee. Stored in kopiyky; WayForPay amount is UAH. */
export const TEACHER_FEE_UAH = 500;
export const TEACHER_FEE_KOPIYKY = 50_000;

/** ISO 4217 numeric code for UAH (DB column `ccy`). */
export const CCY_UAH = 980;

export const WAYFORPAY_CURRENCY = "UAH";
export const WAYFORPAY_DEFAULT_PAY_URL = "https://secure.wayforpay.com/pay";
export const WAYFORPAY_PROVIDER = "wayforpay";

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

/** Checkout URL must be https (never javascript: / relative). */
export function isSafeCheckoutUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * WayForPay Purchase amount is major units with two decimals (500 UAH → "500.00"),
 * not kopiyky. The signed string must match this formatting exactly.
 */
export function formatWayForPayAmount(kopiyky: number): string {
  return (kopiyky / 100).toFixed(2);
}

export function parseWayForPayAmountToKopiyky(amount: unknown): number | null {
  if (typeof amount === "number" && Number.isFinite(amount)) {
    return Math.round(amount * 100);
  }
  if (typeof amount === "string" && amount.trim()) {
    const parsed = Number(amount.trim().replace(",", "."));
    if (Number.isFinite(parsed)) return Math.round(parsed * 100);
  }
  return null;
}

function isWayForPayHostname(hostname: string): boolean {
  return (
    hostname === "secure.wayforpay.com" || hostname.endsWith(".wayforpay.com")
  );
}

export function isAllowedWayForPayCheckoutUrl(
  url: string,
  payUrl = WAYFORPAY_DEFAULT_PAY_URL,
): boolean {
  if (!isSafeCheckoutUrl(url)) return false;
  try {
    const parsed = new URL(url);
    const allowed = new URL(payUrl);
    return (
      parsed.protocol === "https:" &&
      allowed.protocol === "https:" &&
      isWayForPayHostname(parsed.hostname) &&
      parsed.hostname === allowed.hostname
    );
  } catch {
    return false;
  }
}
