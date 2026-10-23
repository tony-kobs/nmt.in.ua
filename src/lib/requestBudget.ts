/**
 * In-memory request budget for the edge proxy.
 *
 * A school NAT is one IP and many students. Page and API traffic for a signed-in
 * user is counted on that user, with a separate per-IP ceiling large enough for
 * a class. Login and password forms stay a tight per-IP limit. Prefetch, Next
 * chunks, and public files are not counted: they are not user actions.
 */

export const BUDGET_WINDOW_MS = 60_000;

/** Credential forms (login, register, reset). Per IP. */
export const LIMIT_AUTH_IP = 20;

/** Document, RSC, and server actions. Per signed-in user, or per IP for a guest. */
export const LIMIT_PAGE_ACTOR = 180;

/** `/api/*` such as presence and avatars. Per signed-in user, or per IP for a guest. */
export const LIMIT_API_ACTOR = 60;

/**
 * Shared ceiling for signed-in page traffic from one IP.
 * 100 students × a busy minute of answers and refreshes, with headroom.
 */
export const LIMIT_PAGE_IP = 8_000;

/** Shared ceiling for signed-in API traffic and inbound webhooks from one IP. */
export const LIMIT_API_IP = 2_000;

export const MAX_BUCKETS = 5_000;

export type BudgetCharge = {
  key: string;
  limit: number;
};

export type BudgetBucket = {
  count: number;
  resetAt: number;
};

const PUBLIC_ASSET =
  /\.(?:webp|avif|png|jpe?g|gif|svg|ico|woff2?|ttf|otf|css|js|map|json|txt|xml|webmanifest)$/i;

/** Files shipped in /public — images, fonts, manifest. */
export function isPublicAsset(pathname: string): boolean {
  return PUBLIC_ASSET.test(pathname);
}

function isAuthPath(pathname: string): boolean {
  return (
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
    pathname.startsWith("/reset-password/")
  );
}

/** Payment and Telegram callbacks are not a student's session. */
function isMachineApi(pathname: string): boolean {
  return (
    pathname === "/api/payments/wayforpay/webhook" ||
    pathname === "/api/telegram/webhook" ||
    pathname === "/api/telegram/notifications/process" ||
    pathname === "/api/marathon/notifications/process" ||
    pathname === "/api/marathon/notifications/health" ||
    pathname === "/api/marathon/stats"
  );
}

function isPrefetch(headers: Headers): boolean {
  if (headers.get("next-router-prefetch") === "1") return true;
  if (headers.get("next-router-segment-prefetch")) return true;
  const purpose = headers.get("purpose") ?? headers.get("sec-purpose");
  return purpose?.toLowerCase().includes("prefetch") ?? false;
}

/** True when this hit must not spend a budget slot. */
export function isUncountedRequest(
  method: string,
  pathname: string,
  headers: Headers,
): boolean {
  if (pathname.startsWith("/_next/") || isPublicAsset(pathname)) return true;
  if (method !== "GET" && method !== "HEAD") return false;
  return isPrefetch(headers);
}

/**
 * Slots to consume for this request. Empty when the request is uncounted.
 * A signed-in user spends a personal slot and an IP ceiling slot. Both must pass.
 */
export function budgetCharges(input: {
  method: string;
  pathname: string;
  headers: Headers;
  ip: string;
  userId: number | null;
}): BudgetCharge[] {
  const { method, pathname, headers, ip, userId } = input;
  if (isUncountedRequest(method, pathname, headers)) return [];

  if (isAuthPath(pathname)) {
    return [{ key: `auth:ip:${ip}`, limit: LIMIT_AUTH_IP }];
  }

  if (isMachineApi(pathname)) {
    return [{ key: `api:ip:${ip}`, limit: LIMIT_API_IP }];
  }

  if (pathname.startsWith("/api/")) {
    if (userId) {
      return [
        { key: `api:user:${userId}`, limit: LIMIT_API_ACTOR },
        { key: `api:ip:${ip}`, limit: LIMIT_API_IP },
      ];
    }
    return [{ key: `api:guest:${ip}`, limit: LIMIT_API_ACTOR }];
  }

  if (userId) {
    return [
      { key: `page:user:${userId}`, limit: LIMIT_PAGE_ACTOR },
      { key: `page:ip:${ip}`, limit: LIMIT_PAGE_IP },
    ];
  }

  return [{ key: `page:guest:${ip}`, limit: LIMIT_PAGE_ACTOR }];
}

export function pruneBuckets(
  buckets: Map<string, BudgetBucket>,
  now: number,
  maxBuckets = MAX_BUCKETS,
) {
  if (buckets.size < maxBuckets) return;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
  if (buckets.size < maxBuckets) return;
  const keys = [...buckets.keys()].slice(0, Math.floor(buckets.size / 2));
  for (const key of keys) buckets.delete(key);
}

/**
 * Consumes every charge, or none. Returns seconds for `Retry-After` when blocked.
 */
export function takeCharges(
  buckets: Map<string, BudgetBucket>,
  charges: BudgetCharge[],
  now: number,
  windowMs = BUDGET_WINDOW_MS,
): { ok: true } | { ok: false; retryAfterSec: number } {
  if (charges.length === 0) return { ok: true };

  pruneBuckets(buckets, now);

  let blockedResetAt: number | null = null;
  for (const charge of charges) {
    const current = buckets.get(charge.key);
    if (current && current.resetAt > now && current.count >= charge.limit) {
      if (blockedResetAt === null || current.resetAt > blockedResetAt) {
        blockedResetAt = current.resetAt;
      }
    }
  }
  if (blockedResetAt !== null) {
    return {
      ok: false,
      retryAfterSec: Math.max(1, Math.ceil((blockedResetAt - now) / 1000)),
    };
  }

  for (const charge of charges) {
    const current = buckets.get(charge.key);
    if (!current || current.resetAt <= now) {
      buckets.set(charge.key, { count: 1, resetAt: now + windowMs });
      continue;
    }
    current.count += 1;
  }
  return { ok: true };
}
