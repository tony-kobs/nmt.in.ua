import type { useTranslations } from "next-intl";

const KNOWN = [
  "closed",
  "not_ready",
  "invalid",
  "duplicate",
  "server",
  "seed_exists",
  "question",
  "no_alternate",
  "locked",
  "missing",
  "materials_required",
  "bot_off",
  "requiredFields",
  "invalidLogin",
  "invalidDisplayName",
  "invalidEmail",
  "passwordTooShort",
  "passwordTooLong",
  "passwordMismatch",
  "loginTaken",
  "emailTaken",
  "reservedLogin",
] as const;

type KnownError = (typeof KNOWN)[number];

export function marathonErrorText(
  t: ReturnType<typeof useTranslations<"Marathon">>,
  code: string | undefined,
): string | null {
  if (!code || !KNOWN.includes(code as KnownError)) return null;
  return t(`errors.${code as KnownError}`);
}
