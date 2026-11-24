import { normalizePagePath } from "@/constants/appRoutes";

/** Cabinet paths a parent may open. Textbook stays so topic links keep working. */
const OPEN_PREFIXES = ["/parent", "/account", "/materials"] as const;

const STUDENT_ACTION_PREFIXES = [
  "/topic",
  "/simulator",
  "/sessions",
  "/results",
  "/consultations",
  "/leaderboard",
  "/problems",
  "/practice",
  "/marathon",
  "/join",
  "/session",
  "/assign",
  "/students",
  "/profiles",
  "/settings",
  "/feedback",
  "/tasks",
  "/admin",
  "/diagnostic",
] as const;

export function parentMayOpen(pathname: string): boolean {
  const path = normalizePagePath(pathname);
  return OPEN_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

/** Student and staff actions a signed-in parent must not stay on. */
export function parentMustLeave(pathname: string): boolean {
  if (parentMayOpen(pathname)) return false;
  const path = normalizePagePath(pathname);
  if (path === "/") return true;
  return STUDENT_ACTION_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

/** Parents land in their cabinet, except when they are accepting another invite. */
export function parentAfterLoginPath(nextPath: string): string {
  const path = nextPath.split("?")[0]?.split("#")[0] ?? "";
  if (path === "/parent" || path === "/parent/accept") return nextPath;
  return "/parent";
}
