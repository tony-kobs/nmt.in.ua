/**
 * Decides what `npm run migrate` should do when `GET_LOCK('nmt_schema')` is busy,
 * and how long a single attempt may block inside MySQL.
 *
 * The host slow log records a statement that runs for at least 5 seconds.
 * `GET_LOCK('nmt_schema', 10)`, `15`, and the older `30` are that statement:
 * the wait sits inside the query. Callers retry with `waitForNamedLock` instead.
 * Each attempt stays under 5 seconds, and the pause between attempts is a sleep
 * in this process. The overall budget does not change: 15 seconds in the app,
 * 12 minutes in `npm run migrate`.
 *
 * The live app takes the same lock only while it applies schema. A connection
 * that still holds it while sleeping, or while running an ordinary read, left
 * the lock on a pooled socket. Waiting on that blocks every deploy; the lock
 * dies when that session ends.
 */

/** Host slow-query threshold. One GET_LOCK must return before this. */
export const SLOW_QUERY_LIMIT_SEC = 5;

/** Seconds a single GET_LOCK may block inside MySQL. Keep this under 5. */
export const SCHEMA_LOCK_ATTEMPT_SEC = 2;

/** Pause in the process between attempts. This wait is not a MySQL statement. */
export const SCHEMA_LOCK_PAUSE_MS = 1000;

const SCHEMA_STATEMENT =
  /^(?:alter|create|drop|rename|truncate|insert|update|delete|replace)\b/i;

function statementText(holder) {
  return String(holder?.info ?? "").trim();
}

/** True when this session is inside the migration critical section. */
export function isSchemaWork(holder) {
  if (!holder || holder.command !== "Query") return false;
  const sql = statementText(holder);
  if (!sql) return false;
  if (/^select\s+version\s+from\s+schema_migrations\b/i.test(sql)) return true;
  if (/^insert\s+into\s+schema_migrations\b/i.test(sql)) return true;
  if (/\b(?:get_lock|release_lock)\s*\(/i.test(sql)) return true;
  return SCHEMA_STATEMENT.test(sql);
}

/**
 * @param {{ command?: string, timeSec?: number, info?: string | null } | null} holder
 * @param {number} watchedAgeSec how long this same non-migration session has held the lock
 * @returns {"busy" | "drop" | "wait" | "retry"}
 */
export function classifySchemaLockHolder(holder, watchedAgeSec = 0) {
  if (!holder || holder.command === "missing") return "retry";
  if (isSchemaWork(holder)) return "busy";
  const timeSec = Number(holder.timeSec) || 0;
  if (holder.command === "Sleep" && timeSec >= 20) return "drop";
  if (holder.command === "Query" && timeSec >= 1) return "drop";
  if (watchedAgeSec >= 15) return "drop";
  return "wait";
}

export function formatSchemaLockHolder(holder) {
  if (!holder) return "none";
  const info = holder.info ? ` ${String(holder.info).replace(/\s+/g, " ").slice(0, 80)}` : "";
  return `id ${holder.id} ${holder.command} ${holder.timeSec ?? 0}s${info}`;
}

export function lockGranted(value) {
  return value === 1 || value === "1" || value === true || value === BigInt(1);
}

export function lockDenied(value) {
  return value === 0 || value === "0" || value === false || value === BigInt(0);
}

/**
 * @param {number} [seconds]
 * @returns {number}
 */
export function lockAttemptSeconds(seconds = SCHEMA_LOCK_ATTEMPT_SEC) {
  if (!Number.isInteger(seconds) || seconds < 0 || seconds >= SLOW_QUERY_LIMIT_SEC) {
    throw new Error(
      `GET_LOCK timeout ${String(seconds)}s would be written to the slow query log (threshold ${SLOW_QUERY_LIMIT_SEC}s)`,
    );
  }
  return seconds;
}

/**
 * @param {unknown} rows
 * @returns {{ status: "acquired" | "busy" | "unknown", got: unknown }}
 */
export function readNamedLock(rows) {
  const row = Array.isArray(rows) ? rows[0] : undefined;
  if (!row || typeof row !== "object") return { status: "unknown", got: undefined };
  const value = "got" in row ? row.got : "GOT" in row ? row.GOT : Object.values(row)[0];
  if (lockGranted(value)) return { status: "acquired", got: value };
  if (lockDenied(value)) return { status: "busy", got: value };
  return { status: "unknown", got: value };
}

/**
 * Retry `GET_LOCK` until the budget runs out.
 * Each attempt uses a timeout under the slow-query threshold. The gap between
 * attempts is `sleep` in this process, so a long wait is not one slow statement.
 * `onBusy` may return `"retry-now"` after it drops a leaked holder.
 *
 * @param {{
 *   query: (sql: string, params: unknown[]) => Promise<unknown>,
 *   name: string,
 *   budgetMs: number,
 *   attemptSec?: number,
 *   pauseMs?: number,
 *   sleep?: (ms: number) => Promise<void>,
 *   now?: () => number,
 *   onBusy?: (info: { attempts: number, elapsedMs: number }) => Promise<"retry-now" | "pause" | void> | "retry-now" | "pause" | void,
 * }} options
 * @returns {Promise<{ status: "acquired" | "busy" | "unknown", attempts: number, got: unknown }>}
 */
export async function waitForNamedLock(options) {
  const attemptSec = lockAttemptSeconds(options.attemptSec ?? SCHEMA_LOCK_ATTEMPT_SEC);
  const pauseMs = options.pauseMs ?? SCHEMA_LOCK_PAUSE_MS;
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = options.now ?? Date.now;
  const started = now();
  let attempts = 0;
  while (now() - started < options.budgetMs) {
    const attemptMark = now();
    const remainingMs = options.budgetMs - (attemptMark - started);
    if (remainingMs <= 0) break;
    const timeout = Math.min(attemptSec, Math.floor(remainingMs / 1000));
    attempts += 1;
    const rows = await options.query("SELECT GET_LOCK(?, ?) AS got", [options.name, timeout]);
    const flag = readNamedLock(rows);
    if (flag.status !== "busy") {
      return { status: flag.status, attempts, got: flag.got };
    }
    const action = options.onBusy
      ? (await options.onBusy({ attempts, elapsedMs: now() - started })) || "pause"
      : "pause";
    const moved = now() !== attemptMark;
    const remaining = options.budgetMs - (now() - started);
    if (remaining <= 0) break;
    if (action === "retry-now" && moved) continue;
    const delay = Math.min(pauseMs, remaining);
    if (delay <= 0) break;
    const stamp = now();
    await sleep(delay);
    if (now() === stamp) break;
  }
  return { status: "busy", attempts, got: 0 };
}
