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

/** Slim public surface: landing + auth + diagnostic (no cabinet chrome). */
export const PUBLIC_CLIENT_NAMESPACES = [
  "LanguageSwitcher",
  "Feedback",
  "Diagnostic",
] as const;

const LOGIN_NAMESPACES = ["LoginForm"] as const;
const REGISTER_NAMESPACES = ["RegisterForm"] as const;
const SETTINGS_NAMESPACES = ["ContentImportForm"] as const;
const DIAGNOSTIC_NAMESPACES = ["Diagnostic", "DiagnosticResult"] as const;
const CONSULTATIONS_NAMESPACES = ["Consultations"] as const;

/** Full set — useful for tests / docs. Prefer pickClientMessages(pathname). */
export const CLIENT_MESSAGE_NAMESPACES = [
  ...CORE_CLIENT_NAMESPACES,
  ...LOGIN_NAMESPACES,
  ...REGISTER_NAMESPACES,
  ...SETTINGS_NAMESPACES,
  ...DIAGNOSTIC_NAMESPACES,
  ...CONSULTATIONS_NAMESPACES,
] as const;

function namespacesForPath(pathname: string): readonly string[] {
  const isLogin = pathname === "/login" || pathname.startsWith("/login/");
  const isRegister =
    pathname === "/register" || pathname.startsWith("/register/");
  const isPublicLanding = pathname === "/welcome" || pathname === "/";
  const isSettings =
    pathname === "/settings" || pathname.startsWith("/settings/");
  const isDiagnostic =
    pathname === "/diagnostic" || pathname.startsWith("/diagnostic/");
  const isConsultations =
    pathname === "/consultations" || pathname.startsWith("/consultations/");

  if (isPublicLanding) {
    return [...PUBLIC_CLIENT_NAMESPACES];
  }

  if (isLogin || isRegister) {
    const keys = new Set<string>(["LanguageSwitcher", "Feedback"]);
    if (isLogin) keys.add("LoginForm");
    if (isRegister) keys.add("RegisterForm");
    return [...keys];
  }

  if (isDiagnostic) {
    return ["LanguageSwitcher", "Feedback", ...DIAGNOSTIC_NAMESPACES];
  }

  const keys = new Set<string>(CORE_CLIENT_NAMESPACES);
  if (isSettings) {
    for (const key of SETTINGS_NAMESPACES) keys.add(key);
  }
  if (isConsultations) {
    for (const key of CONSULTATIONS_NAMESPACES) keys.add(key);
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
