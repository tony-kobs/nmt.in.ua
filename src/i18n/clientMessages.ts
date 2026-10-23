import type { AbstractIntlMessages } from "next-intl";

/**
 * Namespaces always needed by DashboardShell chrome and common cabinet screens.
 * Route-specific forms stay out of the global client payload.
 */
export const CORE_CLIENT_NAMESPACES = [
  "Header",
  "Notifications",
  "Sidebar",
  "Dashboard",
  "Common",
  "LanguageSwitcher",
  "RecentResults",
  "AccountCabinet",
  "TopicTestStart",
  "RecommendedActions",
  "TopicTrainer",
  "TopicTrainerSummary",
  "SessionExpiredNotice",
  "SessionInsufficientTasksNotice",
  "SessionScheduledNotice",
  "LearningSessionsTable",
  "Pagination",
  "TopicResultsTable",
  "MarathonLeaderboard",
  "ProblemsWorkbook",
  "simulator",
  "nmtTrainer",
  "Feedback",
  "FractionPractice",
  "Stage2",
  "TeacherProfile",
  "TeacherPublicCard",
  // Soft-nav from other cabinet routes must already carry these namespaces —
  // `(app)` layout does not re-pick messages mid-chain.
  "Consultations",
  "TeacherStudents",
  "JoinInvite",
  "TeacherAssign",
  "TeacherStudentResults",
  "TeacherStudentSessions",
  "AdminContent",
  "AdminProfiles",
  "Marathon",
] as const;

/**
 * Slim public surface for `(marketing)` layout + guest `/`.
 * Must cover every client namespace any sibling route may need: soft
 * navigations reuse the parent layout's NextIntlClientProvider, so a
 * `/welcome` → `/register` click cannot pick up RegisterForm later. Same
 * reason `TopicTrainer` is unconditional here rather than gated behind
 * `isDiagnosticPath` below — `/welcome` → `/diagnostic` → session is a
 * soft-navigation chain too, and the layout never re-picks messages
 * mid-chain, so a path-gated namespace never actually arrives.
 */
export const PUBLIC_CLIENT_NAMESPACES = [
  "LanguageSwitcher",
  "Common",
  "AuthShared",
  "Feedback",
  "Diagnostic",
  "DiagnosticResult",
  "TopicTrainer",
  "SessionExpiredNotice",
  "LoginForm",
  "RegisterForm",
  "TeacherRegister",
  "TeacherPublicCard",
  "CheckEmail",
  "VerifyEmail",
  "ForgotPassword",
  "ResetPassword",
] as const;

const SETTINGS_NAMESPACES = ["ContentImportForm"] as const;

/**
 * Redundant with `PUBLIC_CLIENT_NAMESPACES` now that `TopicTrainer` moved
 * there too, but harmless — `pickClientMessages` dedupes via `Set`. Kept so
 * `isDiagnosticPath` still documents which route needs this namespace set.
 */
const DIAGNOSTIC_NAMESPACES = ["Diagnostic", "DiagnosticResult"] as const;

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
    pathname === "/verify-email" ||
    pathname.startsWith("/verify-email/") ||
    pathname === "/keep-account" ||
    pathname.startsWith("/keep-account/") ||
    pathname === "/forgot-password" ||
    pathname.startsWith("/forgot-password/") ||
    pathname === "/reset-password" ||
    pathname.startsWith("/reset-password/") ||
    pathname === "/diagnostic" ||
    pathname.startsWith("/diagnostic/") ||
    pathname === "/t" ||
    pathname.startsWith("/t/") ||
    /^\/marathon\/[^/]+$/.test(pathname) ||
    /^\/marathon\/[^/]+\/join$/.test(pathname)
  );
}

function isDiagnosticPath(pathname: string): boolean {
  return pathname === "/diagnostic" || pathname.startsWith("/diagnostic/");
}

function namespacesForPath(pathname: string): readonly string[] {
  const isSettings =
    pathname === "/settings" || pathname.startsWith("/settings/");

  if (isMarketingPath(pathname)) {
    if (isDiagnosticPath(pathname)) {
      return [
        ...new Set([...PUBLIC_CLIENT_NAMESPACES, ...DIAGNOSTIC_NAMESPACES]),
      ];
    }
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
