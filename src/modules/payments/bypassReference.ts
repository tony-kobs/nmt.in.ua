import { isTeacherPaymentReference } from "./constants";

/** First valid 32-hex teacher payment reference, in priority order. */
export function firstValidTeacherPaymentReference(
  ...candidates: Array<string | null | undefined>
): string | null {
  for (const value of candidates) {
    if (typeof value === "string" && isTeacherPaymentReference(value)) {
      return value.trim();
    }
  }
  return null;
}

/**
 * Cookie may still hold a previous pending reference after a new «Сплатити».
 * Prefer the form/checkout reference (newer) when both are valid — never fail
 * solely because they differ.
 */
export function resolveBypassReference(
  cookieRef: string | null | undefined,
  formRefRaw: string | null | undefined,
): string | null {
  return firstValidTeacherPaymentReference(formRefRaw, cookieRef);
}

/** Client register state: latest checkout, then this-submit error, then cookie. */
export function pickTeacherRegisterBypassReference(input: {
  checkoutReference?: string | null;
  errorReference?: string | null;
  pendingCookieReference?: string | null;
}): string | null {
  return firstValidTeacherPaymentReference(
    input.checkoutReference,
    input.errorReference,
    input.pendingCookieReference,
  );
}
