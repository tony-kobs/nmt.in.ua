import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { PUBLIC_PAGE_PATHS } from "@/constants/publicRoutes";
import { clientIp, isBlockedPath } from "@/lib/security";
import {
  SESSION_COOKIE_NAME,
  verifySessionToken,
} from "@/modules/auth/sessionToken";

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

const WINDOW_MS = 60_000;
const LIMIT_PAGE = 90;
const LIMIT_STATIC = 300;
const LIMIT_OTHER = 60;
const LIMIT_AUTH = 20;
const MAX_BUCKETS = 5_000;

function prune(now: number) {
  if (buckets.size < MAX_BUCKETS) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  if (buckets.size < MAX_BUCKETS) return;
  // Drop oldest half if still too large (memory guard on shared hosting).
  const keys = [...buckets.keys()].slice(0, Math.floor(buckets.size / 2));
  for (const key of keys) buckets.delete(key);
}

function take(key: string, limit: number, now: number): boolean {
  prune(now);
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

function limitFor(pathname: string): number {
  if (pathname.startsWith("/_next/static")) return LIMIT_STATIC;
  if (pathname.startsWith("/_next")) return LIMIT_OTHER;
  if (
    pathname === "/login" ||
    pathname === "/register" ||
    pathname.startsWith("/login/") ||
    pathname.startsWith("/register/") ||
    pathname.startsWith("/api/")
  ) {
    return LIMIT_AUTH;
  }
  return LIMIT_PAGE;
}

/** Files shipped in /public — images, fonts, manifest. Never behind the auth guard. */
const PUBLIC_ASSET =
  /\.(?:webp|avif|png|jpe?g|gif|svg|ico|woff2?|ttf|otf|css|js|map|json|txt|xml|webmanifest)$/i;

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_ASSET.test(pathname)) return true;
  return PUBLIC_PAGE_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
}

function requiresAdmin(pathname: string): boolean {
  return pathname === "/settings" || pathname.startsWith("/settings/");
}

async function authGuard(request: NextRequest): Promise<NextResponse | null> {
  const { pathname } = request.nextUrl;

  if (
    isPublicPath(pathname) ||
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next")
  ) {
    return null;
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySessionToken(token) : null;

  if (!session) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (requiresAdmin(pathname) && session.role !== "admin") {
    const home = request.nextUrl.clone();
    home.pathname = "/";
    home.search = "";
    return NextResponse.redirect(home);
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

  // Prefer X-Real-IP / CF / rightmost XFF — never leftmost client spoof.
  const ip = clientIp(request.headers);
  const now = Date.now();
  const limit = limitFor(pathname);
  const kind =
    limit === LIMIT_STATIC ? "static" : limit === LIMIT_AUTH ? "auth" : "app";
  const key = `${ip}:${kind}`;

  if (!take(key, limit, now)) {
    const retryAfter = Math.max(
      1,
      Math.ceil(((buckets.get(key)?.resetAt ?? now + WINDOW_MS) - now) / 1000),
    );
    return new NextResponse("Too Many Requests", {
      status: 429,
      headers: {
        "Retry-After": String(retryAfter),
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  const authResponse = await authGuard(request);
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
     * Apply to all paths except Next image optimizer internals we don't use heavily.
     * Static assets still get a higher limit via limitFor().
     */
    "/((?!_next/image).*)",
  ],
};
