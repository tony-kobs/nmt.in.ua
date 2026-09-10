import type { SessionPayload, UserRole } from "./types";

export const SESSION_COOKIE_NAME = "nmt_session";
export const SESSION_MAX_AGE_SEC = 60 * 60 * 24 * 7;

export type SessionTokenInput = {
  userId: number;
  role: UserRole;
  displayName: string;
  login: string;
  avatarRev?: number;
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
    new TextEncoder().encode(payload),
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
  const view = new Uint8Array(signature);
  return crypto.subtle.verify(
    "HMAC",
    key,
    view,
    new TextEncoder().encode(payload),
  );
}

function isUserRole(value: unknown): value is UserRole {
  return value === "student" || value === "teacher" || value === "admin";
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export async function createSessionToken(
  input: SessionTokenInput,
  nowSec: number = Math.floor(Date.now() / 1000),
): Promise<string> {
  const payload: SessionPayload = {
    userId: input.userId,
    role: input.role,
    displayName: input.displayName.trim(),
    login: input.login.trim(),
    exp: nowSec + SESSION_MAX_AGE_SEC,
  };
  if (isPositiveInt(input.avatarRev)) {
    payload.avatarRev = input.avatarRev;
  }
  const body = toBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = await hmacSign(body);
  return `${body}.${signature}`;
}

export async function verifySessionToken(
  token: string,
  nowSec: number = Math.floor(Date.now() / 1000),
): Promise<SessionPayload | null> {
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
    typeof record.userId !== "number" ||
    !Number.isInteger(record.userId) ||
    record.userId <= 0 ||
    typeof record.exp !== "number" ||
    !Number.isInteger(record.exp) ||
    !isUserRole(record.role)
  ) {
    return null;
  }

  if (record.exp <= nowSec) return null;

  const payload: SessionPayload = {
    userId: record.userId,
    role: record.role,
    exp: record.exp,
  };

  if (isNonEmptyString(record.displayName) && isNonEmptyString(record.login)) {
    payload.displayName = record.displayName.trim();
    payload.login = record.login.trim();
  }

  if (isPositiveInt(record.avatarRev)) {
    payload.avatarRev = record.avatarRev;
  }

  return payload;
}
