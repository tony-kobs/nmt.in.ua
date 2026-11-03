/**
 * Pages that exist in `src/app`. Guests hitting anything else should see the
 * real 404, not a redirect to /login. Keep this list aligned with the
 * filesystem test in `appRoutes.test.ts`.
 */

const EXACT_PAGES = new Set<string>([
  "/",
  "/welcome",
  "/login",
  "/register",
  "/register/check-email",
  "/register/teacher",
  "/register/teacher/fail",
  "/register/teacher/success",
  "/verify-email",
  "/keep-account",
  "/forgot-password",
  "/reset-password",
  "/diagnostic",
  "/account",
  "/admin/marathons",
  "/admin/support",
  "/admin/textbook",
  "/assign",
  "/assign/sessions/new",
  "/consultations",
  "/feedback",
  "/join",
  "/leaderboard",
  "/marathon",
  "/materials",
  "/materials/textbook",
  "/practice/fractions",
  "/practice/interactive",
  "/problems",
  "/profiles",
  "/results",
  "/sessions",
  "/settings",
  "/simulator",
  "/students",
  "/tasks/new",
  "/topic",
]);

const DYNAMIC_PAGES: readonly RegExp[] = [
  /^\/diagnostic\/session\/[^/]+$/,
  /^\/t\/[^/]+$/,
  /^\/marathon\/[^/]+$/,
  /^\/marathon\/[^/]+\/join$/,
  /^\/marathon\/[^/]+\/map$/,
  /^\/marathon\/[^/]+\/final$/,
  /^\/marathon\/[^/]+\/day\/[^/]+$/,
  /^\/admin\/marathons\/[^/]+$/,
  /^\/admin\/textbook\/[^/]+$/,
  /^\/assign\/sessions\/[^/]+$/,
  /^\/join\/[^/]+$/,
  /^\/materials\/[^/]+$/,
  /^\/session\/[^/]+$/,
  /^\/students\/[^/]+$/,
  /^\/tasks\/[^/]+$/,
];

export function normalizePagePath(pathname: string): string {
  const path = pathname.split("?")[0] || "/";
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path || "/";
}

/** True when this pathname is a real page, including public ones. */
export function isKnownPage(pathname: string): boolean {
  const path = normalizePagePath(pathname);
  if (EXACT_PAGES.has(path)) return true;
  return DYNAMIC_PAGES.some((pattern) => pattern.test(path));
}
