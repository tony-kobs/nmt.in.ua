/**
 * Decides what `npm run migrate` should do when `GET_LOCK('nmt_schema')` times out.
 *
 * The live app takes the same lock only while it applies schema. A connection
 * that still holds it while sleeping, or while running an ordinary read, left
 * the lock on a pooled socket. Waiting on that blocks every deploy; the lock
 * dies when that session ends.
 */

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
  return value === 1 || value === "1" || value === true || value === 1n;
}

export function lockDenied(value) {
  return value === 0 || value === "0" || value === false || value === 0n;
}
