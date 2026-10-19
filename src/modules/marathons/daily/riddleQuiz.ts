import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

/** How many riddles a marathon landing draws when the admin has not chosen. */
export const LANDING_RIDDLE_DEFAULT = 3;
export const LANDING_RIDDLE_MIN = 1;
export const LANDING_RIDDLE_MAX = 12;
export const RIDDLE_COOLDOWN_MS = 10_000;
export const RIDDLE_COOKIE_NAME = "nmt_riddle";
export const RIDDLE_MAX_AGE_SEC = 60 * 60 * 24;

const OPTION_MIN = 2;
const OPTION_MAX = 6;

export type StoredOption = {
  id: number;
  label: string;
  correct: boolean;
};

/** Full bank row. Stays on the server. Never pass it to a client component. */
export type StoredRiddle = {
  id: number;
  title: string;
  body: string;
  hint: string | null;
  legacyAnswer: string | null;
  subject: string | null;
  shared: boolean;
  options: StoredOption[];
};

export type PublicOption = {
  id: number;
  label: string;
};

export type PublicRiddle =
  | {
      id: number;
      title: string;
      body: string;
      mode: "text";
    }
  | {
      id: number;
      title: string;
      body: string;
      mode: "quiz";
      solved: false;
      options: PublicOption[];
      lockedUntil: number | null;
    }
  | {
      id: number;
      title: string;
      body: string;
      mode: "quiz";
      solved: true;
      options: PublicOption[];
      choiceId: number;
      hint: string | null;
    };

export type RiddleSessionState = {
  sid: string;
  exp: number;
  /** Riddle id → unix ms when the next guess is allowed. */
  locks: Record<string, number>;
  /** Riddle id → option id that was accepted. */
  solved: Record<string, number>;
};

export type AttemptResult =
  | { status: "invalid" }
  | { status: "locked"; retryAt: number }
  | { status: "wrong"; retryAt: number }
  | { status: "correct"; choiceId: number; hint: string | null };

const FORBIDDEN_PUBLIC_KEYS = new Set([
  "is_correct",
  "isCorrect",
  "correct",
  "answer",
  "legacyAnswer",
  "legacy_answer",
  "explanation",
]);

export function clampLandingRiddleCount(value: unknown): number {
  const count = Number(value);
  if (!Number.isInteger(count)) return LANDING_RIDDLE_DEFAULT;
  if (count < LANDING_RIDDLE_MIN || count > LANDING_RIDDLE_MAX) return LANDING_RIDDLE_DEFAULT;
  return count;
}

export function isQuizReady(riddle: Pick<StoredRiddle, "options">): boolean {
  const options = riddle.options.filter((option) => option.label.trim().length > 0);
  if (options.length < OPTION_MIN || options.length > OPTION_MAX) return false;
  return options.filter((option) => option.correct).length === 1;
}

/** Fisher–Yates. `random` returns a number in [0, 1). */
export function shuffle<T>(items: readonly T[], random: () => number = Math.random): T[] {
  const next = items.slice();
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    const current = next[index]!;
    next[index] = next[swap]!;
    next[swap] = current;
  }
  return next;
}

export function takeRandom<T>(items: readonly T[], count: number, random: () => number = Math.random): T[] {
  const size = Math.max(0, Math.min(Math.floor(count), items.length));
  return shuffle(items, random).slice(0, size);
}

export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function explanationOf(riddle: StoredRiddle): string | null {
  const hint = riddle.hint?.trim() ?? "";
  if (hint) return hint;
  const legacy = riddle.legacyAnswer?.trim() ?? "";
  return legacy || null;
}

export function presentRiddle(
  riddle: StoredRiddle,
  session: RiddleSessionState | null,
  nowMs: number,
  random: () => number = Math.random,
): PublicRiddle {
  const base = { id: riddle.id, title: riddle.title, body: riddle.body };
  if (!isQuizReady(riddle)) return { ...base, mode: "text" };

  const options = shuffle(riddle.options, random).map((option) => ({
    id: option.id,
    label: option.label,
  }));
  const key = String(riddle.id);
  const solvedId = session?.solved[key];
  const solved = riddle.options.find((option) => option.id === solvedId && option.correct);
  if (solved && solvedId != null) {
    return {
      ...base,
      mode: "quiz",
      solved: true,
      options,
      choiceId: solvedId,
      hint: explanationOf(riddle),
    };
  }
  const lock = session?.locks[key] ?? 0;
  return {
    ...base,
    mode: "quiz",
    solved: false,
    options,
    lockedUntil: lock > nowMs ? lock : null,
  };
}

export function buildLandingPayload(
  pool: readonly StoredRiddle[],
  count: number,
  session: RiddleSessionState | null,
  nowMs: number,
  random: () => number = Math.random,
): PublicRiddle[] {
  return takeRandom(pool, clampLandingRiddleCount(count), random).map((riddle) =>
    presentRiddle(riddle, session, nowMs, random),
  );
}

export function gradeRiddleAttempt(input: {
  riddle: StoredRiddle;
  optionId: number;
  session: RiddleSessionState;
  nowMs: number;
  cooldownMs?: number;
}): { session: RiddleSessionState; result: AttemptResult } {
  const { riddle, optionId, session, nowMs } = input;
  const cooldownMs = input.cooldownMs ?? RIDDLE_COOLDOWN_MS;
  const key = String(riddle.id);
  const lockUntil = session.locks[key] ?? 0;
  if (lockUntil > nowMs) {
    return { session, result: { status: "locked", retryAt: lockUntil } };
  }
  if (!isQuizReady(riddle)) return { session, result: { status: "invalid" } };
  const option = riddle.options.find((item) => item.id === optionId);
  if (!option) return { session, result: { status: "invalid" } };
  const already = session.solved[key];
  if (already != null) {
    const accepted = riddle.options.find((item) => item.id === already && item.correct);
    if (accepted) {
      return {
        session,
        result: { status: "correct", choiceId: already, hint: explanationOf(riddle) },
      };
    }
  }
  if (!option.correct) {
    const retryAt = nowMs + cooldownMs;
    return {
      session: { ...session, locks: { ...session.locks, [key]: retryAt } },
      result: { status: "wrong", retryAt },
    };
  }
  const locks = { ...session.locks };
  delete locks[key];
  return {
    session: { ...session, locks, solved: { ...session.solved, [key]: optionId } },
    result: { status: "correct", choiceId: optionId, hint: explanationOf(riddle) },
  };
}

export function answerRiddle(input: {
  riddle: StoredRiddle | null;
  optionId: number;
  session: RiddleSessionState;
  nowMs: number;
}): { session: RiddleSessionState; result: AttemptResult } {
  if (!input.riddle) return { session: input.session, result: { status: "invalid" } };
  return gradeRiddleAttempt(input as {
    riddle: StoredRiddle;
    optionId: number;
    session: RiddleSessionState;
    nowMs: number;
  });
}

export function createRiddleSession(nowMs: number): RiddleSessionState {
  const nowSec = Math.floor(nowMs / 1000);
  return {
    sid: randomUUID(),
    exp: nowSec + RIDDLE_MAX_AGE_SEC,
    locks: {},
    solved: {},
  };
}

function pruneSession(state: RiddleSessionState, nowMs: number): RiddleSessionState {
  const locks: Record<string, number> = {};
  for (const [id, until] of Object.entries(state.locks)) {
    if (Number.isInteger(until) && until > nowMs) locks[id] = until;
  }
  return { ...state, locks };
}

export function signRiddleSession(state: RiddleSessionState, secret: string): string {
  const body = Buffer.from(JSON.stringify({
    typ: "riddle",
    sid: state.sid,
    exp: state.exp,
    locks: state.locks,
    solved: state.solved,
  })).toString("base64url");
  const signature = createHmac("sha256", secret).update(`riddle:${body}`).digest("base64url");
  return `${body}.${signature}`;
}

function isIdMap(value: unknown, max: number): value is Record<string, number> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const entries = Object.entries(value);
  if (entries.length > max) return false;
  return entries.every(([key, item]) => (
    /^[1-9]\d{0,9}$/.test(key) &&
    typeof item === "number" &&
    Number.isSafeInteger(item) &&
    item > 0
  ));
}

export function readRiddleToken(
  token: string,
  secret: string,
  nowMs: number,
): RiddleSessionState | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  const expected = createHmac("sha256", secret).update(`riddle:${body}`).digest("base64url");
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const record = parsed as Record<string, unknown>;
  const nowSec = Math.floor(nowMs / 1000);
  if (
    record.typ !== "riddle" ||
    typeof record.sid !== "string" ||
    record.sid.length < 8 ||
    record.sid.length > 80 ||
    typeof record.exp !== "number" ||
    !Number.isInteger(record.exp) ||
    record.exp <= nowSec ||
    !isIdMap(record.locks, 30) ||
    !isIdMap(record.solved, 40)
  ) {
    return null;
  }
  return pruneSession({
    sid: record.sid,
    exp: record.exp,
    locks: record.locks,
    solved: record.solved,
  }, nowMs);
}

/** Keys and explanation text that must not reach the browser before a correct guess. */
export function publicRiddleLeaks(value: unknown, secrets: readonly string[] = []): string[] {
  const leaks: string[] = [];
  const hidden = secrets.map((item) => item.trim()).filter(Boolean);
  walk(value, (key, item) => {
    if (FORBIDDEN_PUBLIC_KEYS.has(key)) leaks.push(key);
    if (typeof item === "string" && hidden.some((secret) => item.includes(secret))) {
      leaks.push(key || "value");
    }
  });
  return leaks;
}

function walk(value: unknown, visit: (key: string, item: unknown) => void): void {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  const solved = "solved" in value && (value as { solved?: unknown }).solved === true;
  for (const [key, item] of Object.entries(value)) {
    if (key === "hint" && solved) {
      walk(item, visit);
      continue;
    }
    visit(key, item);
    walk(item, visit);
  }
}
