/** Shared path / probe detection for the request proxy and docs. */

const BLOCKED_PATH =
  /(?:^|\/)(?:\.env(?:\..*)?|\.git(?:\/|$)|\.svn|\.hg|wp-admin|wp-login\.php|xmlrpc\.php|phpmyadmin|adminer|cgi-bin|vendor\/phpunit|actuator|debug\/default|server-status)(?:\/|$)/i;

const BLOCKED_EXT =
  /\.(?:php|phtml|asp|aspx|jsp|cgi|exe|bat|cmd|sh|bash|py|pl|rb)(?:\/|$|\?)/i;

const BLOCKED_NAME =
  /(?:^|\/)(?:\.htaccess|\.htpasswd|web\.config|composer\.(?:json|lock)|id_rsa|id_dsa|\.DS_Store)(?:\/|$)/i;

export function isBlockedPath(pathname: string): boolean {
  const path = pathname.split("?")[0] || "/";
  return (
    BLOCKED_PATH.test(path) ||
    BLOCKED_EXT.test(path) ||
    BLOCKED_NAME.test(path) ||
    path.includes("..")
  );
}

/** Loose IPv4 / IPv6 check — enough to reject empty / garbage header values. */
export function looksLikeIp(value: string): boolean {
  const v = value.trim();
  if (!v || v.length > 45) return false;
  // IPv4
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(v)) {
    return v.split(".").every((octet) => {
      const n = Number(octet);
      return n >= 0 && n <= 255;
    });
  }
  // IPv6 (compressed forms included)
  if (v.includes(":")) {
    return /^[0-9a-fA-F:]+$/.test(v) && (v.match(/:/g)?.length ?? 0) >= 2;
  }
  return false;
}

export type ClientIpEnv = {
  TRUSTED_PROXY_HOPS?: string;
  NODE_ENV?: string;
};

/**
 * How many reverse-proxy hops sit in front of Node.
 * - production default: 1 (panel/nginx → Node on 127.x)
 * - development default: 0 (do not trust X-Forwarded-For at all)
 * Override with TRUSTED_PROXY_HOPS=0..5
 */
export function readTrustedProxyHops(env: ClientIpEnv = process.env): number {
  const raw = env.TRUSTED_PROXY_HOPS;
  if (raw !== undefined && raw !== "") {
    const n = Number(raw);
    if (Number.isInteger(n) && n >= 0 && n <= 5) return n;
  }
  return env.NODE_ENV === "production" ? 1 : 0;
}

/**
 * Client IP for rate limiting.
 *
 * Never trust the *leftmost* X-Forwarded-For entry — clients can set it.
 * Order of preference:
 * 1. CF-Connecting-IP (Cloudflare overwrites; not client-spoofable at the edge)
 * 2. X-Real-IP (typical nginx: `proxy_set_header X-Real-IP $remote_addr`)
 * 3. X-Forwarded-For from the right, skipping TRUSTED_PROXY_HOPS proxy entries
 *    (when the edge uses `$proxy_add_x_forwarded_for` and appends the socket peer)
 *
 * If TRUSTED_PROXY_HOPS=0, step 3 is skipped entirely.
 */
export function clientIp(
  headers: Headers,
  env: ClientIpEnv = process.env,
): string {
  const cf = headers.get("cf-connecting-ip")?.trim();
  if (cf && looksLikeIp(cf)) return cf;

  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp && looksLikeIp(realIp)) return realIp;

  const hops = readTrustedProxyHops(env);
  if (hops <= 0) return "unknown";

  const forwarded = headers.get("x-forwarded-for");
  if (!forwarded) return "unknown";

  const parts = forwarded
    .split(",")
    .map((part) => part.trim())
    .filter((part) => looksLikeIp(part));
  if (parts.length === 0) return "unknown";

  // hops=1 → last entry (what the immediate proxy saw / appended)
  const index = Math.max(0, parts.length - hops);
  return parts[index] ?? parts[parts.length - 1]!;
}
