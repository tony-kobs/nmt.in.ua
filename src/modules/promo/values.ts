/** Pure promo and ref values. Safe to import from the request proxy. */

const CODE_PATTERN = /^[A-Z0-9]+(?:-[A-Z0-9]+)*$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ID_PATTERN = /^[1-9]\d{0,9}$/;

export const PROMO_COOKIE = "nmt_promo";
export const REF_COOKIE = "nmt_ref";
export const ATTRIBUTION_MAX_AGE_SEC = 60 * 60 * 24 * 30;

export const ACCESS_DAYS_MIN = 1;
export const ACCESS_DAYS_MAX = 3660;

/** Upper case, 4–32 characters, letters, digits and single hyphens. */
export function normalizePromoCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (code.length < 4 || code.length > 32) return null;
  if (!CODE_PATTERN.test(code)) return null;
  return code;
}

/**
 * Teacher slug or numeric id. A string of digits is an id, not a slug,
 * so `?ref=12` never matches a profile whose slug happens to be "12".
 */
export function normalizeTeacherRef(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (ID_PATTERN.test(value)) return value;
  const slug = value.toLowerCase();
  if (slug.length < 2 || slug.length > 48) return null;
  if (!SLUG_PATTERN.test(slug)) return null;
  return slug;
}

export function isTeacherIdRef(ref: string): boolean {
  return ID_PATTERN.test(ref);
}

export function attributionFromSearch(params: URLSearchParams): {
  promo: string | null;
  ref: string | null;
} {
  return {
    promo: normalizePromoCode(params.get("promo")),
    ref: normalizeTeacherRef(params.get("ref")),
  };
}

/** The link the visitor just opened wins over an older cookie. */
export function mergeAttribution(
  fromQuery: { promo: string | null; ref: string | null },
  fromCookie: { promo: string | null; ref: string | null },
): { promo: string | null; ref: string | null } {
  return {
    promo: fromQuery.promo ?? fromCookie.promo,
    ref: fromQuery.ref ?? fromCookie.ref,
  };
}

export function parseAccessDays(raw: unknown): number | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const text = String(raw).trim();
  if (!/^\d+$/.test(text)) return null;
  const days = Number(text);
  if (!Number.isInteger(days) || days < ACCESS_DAYS_MIN || days > ACCESS_DAYS_MAX) {
    return null;
  }
  return days;
}

/** Empty means no cap. Zero and junk are rejected. */
export function parseMaxUses(raw: unknown): number | null | "invalid" {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (text === "") return null;
  if (!/^\d+$/.test(text)) return "invalid";
  const uses = Number(text);
  if (!Number.isInteger(uses) || uses < 1 || uses > 1_000_000) return "invalid";
  return uses;
}

export const PROMO_WRITE_ERRORS = [
  "invalid_code",
  "code_taken",
  "invalid_days",
  "invalid_uses",
  "invalid_expiry",
  "teacher_not_found",
  "forbidden",
  "not_found",
  "server",
] as const;

export type PromoWriteCode = (typeof PROMO_WRITE_ERRORS)[number];

export const REDEEM_ERRORS = [
  "invalid",
  "unknown",
  "inactive",
  "expired",
  "exhausted",
  "already",
  "not_student",
  "server",
] as const;

export type RedeemCode = (typeof REDEEM_ERRORS)[number];

/** Free access lasts N times 24 hours, starting from `from`. */
export function addAccessDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

export function accessBase(now: Date, currentUntil: Date | null): Date {
  if (currentUntil && currentUntil.getTime() > now.getTime()) return currentUntil;
  return now;
}
