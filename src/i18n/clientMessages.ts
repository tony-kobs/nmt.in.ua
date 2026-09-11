import type { AbstractIntlMessages } from "next-intl";

/**
 * Namespaces always needed by DashboardShell chrome and common cabinet screens.
 * Route-specific forms stay out of the global client payload.
 */
export const CORE_CLIENT_NAMESPACES = [
  "Header",
  "Sidebar",
  "Dashboard",
  "Common",
  "LanguageSwitcher",
  "RecentResults",
  "AccountCabinet",
  "TopicTestStart",
  "RecommendedActions",
  "MentorAssign",
  "TopicTrainer",
  "TopicTrainerSummary",
  "LearningSessionsTable",
  "ProblemsWorkbook",
  "simulator",
  "nmtTrainer",
  "Feedback",
] as const;

/**
 * Slim public surface for `(marketing)` layout + guest `/`.
 * Must cover every client namespace any sibling route may need: soft
 * navigations reuse the parent layout's NextIntlClientProvider, so a
 * `/welcome` → `/register` click cannot pick up RegisterForm later.
 */
export const PUBLIC_CLIENT_NAMESPACES = [
  "LanguageSwitcher",
  "Feedback",
  "Diagnostic",
  "DiagnosticResult",
  "LoginForm",
  "RegisterForm",
] as const;

const SETTINGS_NAMESPACES = ["ContentImportForm"] as const;

/** Full set — useful for tests / docs. Prefer pickClientMessages(pathname). */
export const CLIENT_MESSAGE_NAMESPACES = [
  ...CORE_CLIENT_NAMESPACES,
  ...PUBLIC_CLIENT_NAMESPACES,
  ...SETTINGS_NAMESPACES,
] as const;

function isMarketingPath(pathname: string): boolean {
  return (
    pathname === "/" ||
    pathname === "/welcome" ||
    pathname.startsWith("/welcome/") ||
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname === "/register" ||
    pathname.startsWith("/register/") ||
    pathname === "/diagnostic" ||
    pathname.startsWith("/diagnostic/")
  );
}

function namespacesForPath(pathname: string): readonly string[] {
  const isSettings =
    pathname === "/settings" || pathname.startsWith("/settings/");

  if (isMarketingPath(pathname)) {
    return [...PUBLIC_CLIENT_NAMESPACES];
  }

  const keys = new Set<string>(CORE_CLIENT_NAMESPACES);
  if (isSettings) {
    for (const key of SETTINGS_NAMESPACES) keys.add(key);
  }
  return [...keys];
}

export function pickClientMessages(
  messages: AbstractIntlMessages,
  pathname = "/",
): AbstractIntlMessages {
  const picked: AbstractIntlMessages = {};
  for (const key of namespacesForPath(pathname)) {
    const value = messages[key];
    if (value !== undefined) {
      picked[key] = value;
    }
  }
  return picked;
}
