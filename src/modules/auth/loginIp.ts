import { looksLikeIp } from "@/lib/security";

type HeaderSource = {
  get(name: string): string | null;
};

function normalizeIpToken(raw: string): string {
  let value = raw.trim();
  if (value.startsWith("[")) {
    const end = value.indexOf("]");
    if (end > 1) value = value.slice(1, end);
  }
  const v4Port = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(value);
  if (v4Port?.[1]) value = v4Port[1];
  if (value.toLowerCase().startsWith("::ffff:")) {
    const mapped = value.slice("::ffff:".length);
    if (looksLikeIp(mapped)) return mapped;
  }
  return value;
}

/**
 * Client address behind nginx.
 * First hop of `X-Forwarded-For` (panel sets or appends it), then `X-Real-IP`,
 * then `CF-Connecting-IP`. Empty when none of those is a plausible IP.
 */
export function loginClientIp(headers: HeaderSource): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0] ?? "";
    const ip = normalizeIpToken(first);
    if (looksLikeIp(ip)) return ip;
  }
  const real = normalizeIpToken(headers.get("x-real-ip") ?? "");
  if (looksLikeIp(real)) return real;
  const cf = normalizeIpToken(headers.get("cf-connecting-ip") ?? "");
  if (looksLikeIp(cf)) return cf;
  return null;
}

export function loginUserAgent(
  headers: HeaderSource,
  max = 255,
): string | null {
  const raw = headers.get("user-agent");
  if (!raw) return null;
  const clean = raw.replace(/[\u0000-\u001F\u007F]/g, "").trim();
  if (!clean) return null;
  return clean.slice(0, max);
}
