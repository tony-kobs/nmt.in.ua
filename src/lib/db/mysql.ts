import "server-only";
import mysql, { type Pool, type PoolConnection, type ResultSetHeader } from "mysql2/promise";

/** Minimal transactional SQL port used by server-side modules. */
export type SqlConnection = {
  beginTransaction(): Promise<void>;
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  execute(
    sql: string,
    params?: unknown[],
  ): Promise<{ insertId: number; affectedRows: number }>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  release(): void;
};

/**
 * The pool lives on globalThis so Turbopack HMR reuses it instead of leaking a new
 * pool (and a new batch of sockets) on every module re-evaluation in dev.
 */
type DbGlobal = typeof globalThis & { __nmtMysqlPool?: Pool };
const dbGlobal = globalThis as DbGlobal;

/** Remote shared MySQL often drops idle sockets — retry these at connect/query time. */
const TRANSIENT_DB_ERROR_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EPIPE",
  "PROTOCOL_CONNECTION_LOST",
  "PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR",
  "POOL_CLOSED",
]);

const MAX_CONNECT_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = 120;

/**
 * A pooled socket is only worth `ping`-ing when it sat idle long enough for the
 * shared host to have dropped it. Pinging one we released milliseconds ago costs
 * a full round trip on every query — noticeable when a student answers question
 * after question, where each answer is its own request.
 */
const DEFAULT_PING_AFTER_IDLE_MS = 10_000;
const lastReleasedAt = new WeakMap<PoolConnection, number>();

/** Exported for unit testing — see the comment above. */
export function shouldPingIdleConnection(
  releasedAt: number | undefined,
  now: number,
  idleThresholdMs: number,
): boolean {
  // No timestamp means the pool just opened this socket — the handshake is the ping.
  if (releasedAt === undefined) return false;
  return now - releasedAt >= idleThresholdMs;
}

function needsPing(connection: PoolConnection): boolean {
  return shouldPingIdleConnection(
    lastReleasedAt.get(connection),
    Date.now(),
    readPingAfterIdleMs(),
  );
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function readEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function readPositiveIntEnv(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (raw === undefined) {
    return defaultValue;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(
      `Invalid environment variable ${name}: expected a positive integer, got "${raw}".`,
    );
  }
  return value;
}

function readPingAfterIdleMs(): number {
  const raw = process.env.DB_PING_AFTER_IDLE_MS;
  if (raw === undefined) return DEFAULT_PING_AFTER_IDLE_MS;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(
      `Invalid environment variable DB_PING_AFTER_IDLE_MS: expected a non-negative integer, got "${raw}".`,
    );
  }
  return value;
}

function isTransientDbError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const record = error as { code?: string; message?: string; errno?: number };
  if (typeof record.code === "string" && TRANSIENT_DB_ERROR_CODES.has(record.code)) {
    return true;
  }
  if (record.errno === -4077 || record.errno === -104) {
    return true;
  }
  const message = record.message;
  return (
    typeof message === "string" &&
    (message.includes("ECONNRESET") ||
      message.includes("ECONNREFUSED") ||
      message.includes("PROTOCOL_CONNECTION_LOST") ||
      message.includes("Pool is closed"))
  );
}

/**
 * A connect-phase timeout (no response at all within `connectTimeout`, e.g. a firewall
 * silently dropping packets instead of refusing the connection) means the host is
 * unreachable right now — retrying repeats the exact same multi-second wait for no benefit.
 * This is distinct from the dropped-idle-socket case `isTransientDbError` targets (ECONNRESET
 * et al.), which fails fast and is worth retrying. Left un-retried here, a single connect
 * attempt still costs up to `connectTimeout`; retried at MAX_CONNECT_ATTEMPTS it silently
 * multiplies that into a `connectTimeout * MAX_CONNECT_ATTEMPTS`-long hang (45s at the
 * defaults) behind a static "loading" button before any error ever surfaces to the user.
 */
function isConnectTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  return (error as { code?: string }).code === "ETIMEDOUT";
}

function isPoolClosedError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const record = error as { code?: string; message?: string };
  return (
    record.code === "POOL_CLOSED" ||
    (typeof record.message === "string" && record.message.includes("Pool is closed"))
  );
}

/**
 * Drops the pool only if it is still the current one. Without the identity check two
 * concurrent renders racing on the same dead socket would end the pool twice, and the
 * second `end()` makes every request already waiting on `getConnection()` fail with
 * "Pool is closed."
 */
function resetPool(stale: Pool): void {
  if (dbGlobal.__nmtMysqlPool !== stale) {
    return;
  }
  dbGlobal.__nmtMysqlPool = undefined;
  void stale.end().catch(() => undefined);
}

function getPool(): Pool {
  const existing = dbGlobal.__nmtMysqlPool;
  if (existing) {
    return existing;
  }

  const created = mysql.createPool({
    host: readEnv("DB_HOST"),
    port: readPositiveIntEnv("DB_PORT", 3306),
    user: readEnv("DB_USER"),
    password: readEnv("DB_PASSWORD"),
    database: readEnv("DB_NAME"),
    waitForConnections: true,
    connectionLimit: readPositiveIntEnv("DB_CONNECTION_LIMIT", 10),
    connectTimeout: readPositiveIntEnv("DB_CONNECT_TIMEOUT_MS", 15_000),
    // Shared hosting closes idle sessions on its own `wait_timeout`; recycle ours first
    // so the pool hands out live sockets instead of ones the server already dropped.
    maxIdle: readPositiveIntEnv("DB_MAX_IDLE", 4),
    idleTimeout: readPositiveIntEnv("DB_IDLE_TIMEOUT_MS", 30_000),
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    charset: "utf8mb4",
    ...(process.env.DB_SSL === "1" ? { ssl: {} } : {}),
  });

  (created as mysql.Pool & { on(event: "error", listener: (error: Error) => void): void }).on(
    "error",
    (error) => {
      // A dead socket is a per-connection problem: `acquireRawConnection` destroys it and
      // retries. Ending the whole pool here would take down unrelated in-flight requests.
      console.error("mysql pool error", error);
    },
  );

  dbGlobal.__nmtMysqlPool = created;
  return created;
}

function wrap(connection: PoolConnection): SqlConnection {
  let broken = false;

  const markBroken = (error: unknown) => {
    if (isTransientDbError(error)) {
      broken = true;
    }
  };

  return {
    beginTransaction: () => connection.beginTransaction(),
    query: async <T,>(sql: string, params: unknown[] = []) => {
      try {
        const [rows] = await connection.execute(sql, params as never[]);
        return rows as T[];
      } catch (error) {
        markBroken(error);
        throw error;
      }
    },
    execute: async (sql: string, params: unknown[] = []) => {
      try {
        const [result] = await connection.execute(sql, params as never[]);
        const header = result as ResultSetHeader;
        return { insertId: header.insertId, affectedRows: header.affectedRows };
      } catch (error) {
        markBroken(error);
        throw error;
      }
    },
    commit: () => connection.commit(),
    rollback: () => connection.rollback(),
    release: () => {
      if (broken) {
        lastReleasedAt.delete(connection);
        connection.destroy();
        return;
      }
      lastReleasedAt.set(connection, Date.now());
      connection.release();
    },
  };
}

/** Exported for unit testing — see `isConnectTimeoutError`'s doc comment. */
export function shouldRetryConnectError(
  error: unknown,
  attempt: number,
  maxAttempts: number = MAX_CONNECT_ATTEMPTS,
): boolean {
  return (
    attempt < maxAttempts && isTransientDbError(error) && !isConnectTimeoutError(error)
  );
}

async function acquireRawConnection(): Promise<PoolConnection> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_CONNECT_ATTEMPTS; attempt += 1) {
    const pool = getPool();
    let connection: PoolConnection | undefined;
    try {
      connection = await pool.getConnection();
      if (needsPing(connection)) {
        await connection.ping();
      }
      return connection;
    } catch (error) {
      lastError = error;
      // destroy() evicts the dead socket from the pool; release() would hand it back out.
      if (connection) {
        lastReleasedAt.delete(connection);
        connection.destroy();
      }
      if (!shouldRetryConnectError(error, attempt, MAX_CONNECT_ATTEMPTS)) {
        throw error;
      }
      if (isPoolClosedError(error)) {
        resetPool(pool);
      }
      console.error(
        `mysql: connect attempt ${attempt}/${MAX_CONNECT_ATTEMPTS} failed, retrying`,
        error,
      );
      await sleep(RETRY_BACKOFF_MS * attempt);
    }
  }

  throw lastError;
}

/** Acquire a pooled connection for a single transactional unit of work. */
export async function getConnection(): Promise<SqlConnection> {
  return wrap(await acquireRawConnection());
}
