import "server-only";

import { cookies } from "next/headers";
import {
  createRiddleSession,
  readRiddleToken,
  RIDDLE_COOKIE_NAME,
  RIDDLE_MAX_AGE_SEC,
  signRiddleSession,
  type RiddleSessionState,
} from "./riddleQuiz";

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

/** Read-only. A missing or tampered cookie is an empty visit, not a new id. */
export async function readRiddleSession(nowMs = Date.now()): Promise<RiddleSessionState | null> {
  const jar = await cookies();
  const token = jar.get(RIDDLE_COOKIE_NAME)?.value;
  if (!token) return null;
  return readRiddleToken(token, readSecret(), nowMs);
}

export async function openRiddleSession(nowMs = Date.now()): Promise<RiddleSessionState> {
  return (await readRiddleSession(nowMs)) ?? createRiddleSession(nowMs);
}

export async function writeRiddleSession(session: RiddleSessionState): Promise<void> {
  const jar = await cookies();
  const nowSec = Math.floor(Date.now() / 1000);
  jar.set(RIDDLE_COOKIE_NAME, signRiddleSession({ ...session, exp: nowSec + RIDDLE_MAX_AGE_SEC }, readSecret()), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: RIDDLE_MAX_AGE_SEC,
  });
}
