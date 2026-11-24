/** Default order form when the public env value is not set. */
export const BURCOB_LANDING_FORM_DEFAULT = "https://www.burcob.online/#zayavka";

/**
 * Teacher-only link «Замов верстку».
 * Unset env uses the default, so the block is visible.
 * An empty value hides the block. Anything that is not https is ignored.
 */
export function burcobLandingFormUrl(
  raw: string | undefined = process.env.NEXT_PUBLIC_BURCOB_LANDING_FORM_URL,
): string | null {
  if (raw === undefined) return BURCOB_LANDING_FORM_DEFAULT;
  const value = raw.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** https URL, or a same-site path such as /landing/photo.webp. */
export function isTeacherMediaUrl(value: string): boolean {
  if (value.startsWith("/") && !value.startsWith("//") && !value.includes("\\")) {
    return value.length <= 500;
  }
  try {
    const url = new URL(value);
    return url.protocol === "https:" && value.length <= 500;
  } catch {
    return false;
  }
}
