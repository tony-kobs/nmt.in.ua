import "server-only";

import { cookies } from "next/headers";

/**
 * Signed anonymous identity for the public diagnostic test. Deliberately
 * separate from `nmt_session` (sessionToken.ts): it never carries a role or
 * userId, so even if it were somehow read by auth code it cannot grant any
 * privilege — see src/proxy.ts's authGuard, which only ever reads
 * SESSION_COOKIE_NAME. Payload shape mirrors sessionToken.ts's pattern but
 * is kept self-contained (small, acceptable duplication — every session-like
 * module in this repo owns its own signing helpers).
 */
export const GUEST_COOKIE_NAME = "nmt_guest";
export const GUEST_MAX_AGE_SEC = 60 * 60 * 24 * 30;

type GuestPayload = {
  typ: "guest";
  guestId: string;
  exp: number;
};

function readSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET is required in production.");
    }
    return "dev-insecure-session-secret-change-me";
  }
  return secret;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array | null {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (padded.length % 4)) % 4;
  const base64 = padded + "=".repeat(padLen);
  try {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch {
    return null;
  }
}

/** Domain-separated from sessionToken.ts's HMAC input (`"guest:" + body`)
 * so a signature can never be replayed across the two cookie kinds even if
 * they happen to share SESSION_SECRET. */
async function hmacSign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(readSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`guest:${payload}`),
  );
  return toBase64Url(new Uint8Array(signature));
}

async function hmacVerify(payload: string, signatureB64: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(readSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const signature = fromBase64Url(signatureB64);
  if (!signature) return false;
  return crypto.subtle.verify(
    "HMAC",
    key,
    new Uint8Array(signature),
    new TextEncoder().encode(`guest:${payload}`),
  );
}

export async function createGuestToken(
  guestId: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): Promise<string> {
  const payload: GuestPayload = {
    typ: "guest",
    guestId,
    exp: nowSec + GUEST_MAX_AGE_SEC,
  };
  const body = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await hmacSign(body);
  return `${body}.${signature}`;
}

export async function verifyGuestToken(
  token: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): Promise<{ guestId: string } | null> {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;

  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!(await hmacVerify(body, signature))) return null;

  const bytes = fromBase64Url(body);
  if (!bytes) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  const record = parsed as Record<string, unknown>;
  if (
    record.typ !== "guest" ||
    typeof record.guestId !== "string" ||
    record.guestId.length === 0 ||
    typeof record.exp !== "number" ||
    !Number.isInteger(record.exp)
  ) {
    return null;
  }

  if (record.exp <= nowSec) return null;

  return { guestId: record.guestId };
}

/** Read-only: verifies the existing cookie if present. Never mints a new
 * one — safe to call from a Server Component render. */
export async function getGuestId(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(GUEST_COOKIE_NAME)?.value;
  if (!token) return null;
  const payload = await verifyGuestToken(token);
  return payload?.guestId ?? null;
}

/** Mints and sets a fresh signed cookie if the current one is absent or
 * invalid (tampered/expired). Server Actions / Route Handlers only. */
export async function getOrCreateGuestId(): Promise<string> {
  const existing = await getGuestId();
  if (existing) return existing;

  const guestId = crypto.randomUUID();
  const token = await createGuestToken(guestId);
  const cookieStore = await cookies();
  cookieStore.set(GUEST_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: GUEST_MAX_AGE_SEC,
  });
  return guestId;
}

export async function clearGuestCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(GUEST_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
