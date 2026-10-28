import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { PUBLIC_PAGE_PATHS } from "@/constants/publicRoutes";
import { hasPermission } from "@/modules/auth/permissions";
import { isMarathonManagePath, isPublicMarathonPath } from "@/modules/marathons/daily/routes";
import {
  budgetCharges,
  isPublicAsset,
  isUncountedRequest,
  takeCharges,
  type BudgetBucket,
} from "@/lib/requestBudget";
import { clientIp, isBlockedPath } from "@/lib/security";
import { absoluteSiteUrl } from "@/lib/siteOrigin";
import type { SessionPayload } from "@/modules/auth/types";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "@/modules/auth/sessionToken";

function redirectOnSite(path: string): NextResponse {
  return NextResponse.redirect(absoluteSiteUrl(path));
}

const buckets = new Map<string, BudgetBucket>();

function isPublicPath(pathname: string): boolean {
  if (isPublicAsset(pathname)) return true;
  // Includes `/t` so public teacher cards (`/t/{slug}`) skip the auth guard.
  return PUBLIC_PAGE_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  ) || isPublicMarathonPath(pathname);
}

function requiresAdmin(pathname: string): boolean {
  return (
    pathname === "/settings" ||
    pathname.startsWith("/settings/") ||
    pathname === "/admin/textbook" ||
    pathname.startsWith("/admin/textbook/") ||
    pathname === "/profiles" ||
    pathname.startsWith("/profiles/") ||
    pathname === "/feedback" ||
    pathname.startsWith("/feedback/") ||
    pathname === "/tasks" ||
    pathname.startsWith("/tasks/")
  );
}

function requiresTeacherOrAdmin(pathname: string): boolean {
  return pathname === "/students" || pathname.startsWith("/students/");
}

function skipsAuth(pathname: string): boolean {
  return (
    isPublicPath(pathname) ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next")
  );
}

async function readSession(request: NextRequest): Promise<SessionPayload | null> {
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

/**
 * Cheap cookie gate only. Admin, teacher, and marathon:manage pages call
 * `requireUser` / `requireRole`, which re-read role and ban from `app_users`.
 */
function authGuard(
  request: NextRequest,
  session: SessionPayload | null,
): NextResponse | null {
  const { pathname } = request.nextUrl;

  if (skipsAuth(pathname)) return null;

  if (!session) {
    const loginUrl = new URL(absoluteSiteUrl("/login"));
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (requiresAdmin(pathname) && session.role !== "admin") {
    return redirectOnSite("/");
  }

  if (
    isMarathonManagePath(pathname) &&
    !hasPermission(session.role, "marathon:manage")
  ) {
    return redirectOnSite("/");
  }

  if (
    requiresTeacherOrAdmin(pathname) &&
    session.role !== "teacher" &&
    session.role !== "admin"
  ) {
    return redirectOnSite("/");
  }

  return null;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isBlockedPath(pathname)) {
    return new NextResponse("Not Found", {
      status: 404,
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  // Chunks and public files skip the session read. A cabinet prefetch still
  // needs it, because the auth guard runs on that path.
  const uncounted = isUncountedRequest(request.method, pathname, request.headers);
  const session =
    uncounted && skipsAuth(pathname) ? null : await readSession(request);
  const ip = clientIp(request.headers);
  const verdict = takeCharges(
    buckets,
    budgetCharges({
      method: request.method,
      pathname,
      headers: request.headers,
      ip,
      userId: session?.userId ?? null,
    }),
    Date.now(),
  );

  if (!verdict.ok) {
    return new NextResponse("Too Many Requests", {
      status: 429,
      headers: {
        "Retry-After": String(verdict.retryAfterSec),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  const authResponse = authGuard(request, session);
  if (authResponse) return authResponse;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);
  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: [
    /*
     * Apply to all paths except the image optimizer.
     * Chunks, public files, and router prefetch do not spend the budget.
     */
    "/((?!_next/image).*)",
  ],
};
