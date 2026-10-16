import "server-only";

import type { SqlConnection } from "@/lib/db/mysql";
import { PRESENCE_TOUCH_GAP_SEC } from "./presenceRules";
import { loginClientIp, loginUserAgent } from "./loginIp";

const SQL_CREATE = `
  CREATE TABLE IF NOT EXISTS user_sessions (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id INT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    revoked_at TIMESTAMP NULL DEFAULT NULL,
    last_seen_at TIMESTAMP NULL DEFAULT NULL,
    ip VARCHAR(45) NULL DEFAULT NULL,
    user_agent VARCHAR(255) NULL DEFAULT NULL,
    PRIMARY KEY (id),
    KEY idx_user_sessions_user (user_id, id),
    KEY idx_user_sessions_presence (user_id, revoked_at, expires_at, last_seen_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const SQL_TOUCH = `
  UPDATE user_sessions
  SET last_seen_at = CURRENT_TIMESTAMP
  WHERE id = ?
    AND user_id = ?
    AND revoked_at IS NULL
    AND expires_at > CURRENT_TIMESTAMP
    AND (
      last_seen_at IS NULL
      OR last_seen_at < (CURRENT_TIMESTAMP - INTERVAL ${PRESENCE_TOUCH_GAP_SEC} SECOND)
    )
`;

const SQL_TOUCH_USER = `
  UPDATE app_users
  SET last_seen_at = CURRENT_TIMESTAMP
  WHERE id = ?
`;

const SQL_REVOKE = `
  UPDATE user_sessions
  SET revoked_at = CURRENT_TIMESTAMP
  WHERE id = ? AND user_id = ? AND revoked_at IS NULL
`;

const SQL_INSERT = `
  INSERT INTO user_sessions (user_id, expires_at, last_seen_at, ip, user_agent)
  VALUES (?, FROM_UNIXTIME(?), CURRENT_TIMESTAMP, ?, ?)
`;

const ENTRY_LIMIT = 40;

const SQL_LIST = `
  SELECT s.id, s.user_id, s.created_at, s.ip, s.user_agent,
         u.display_name, u.login
  FROM user_sessions s
  INNER JOIN app_users u ON u.id = s.user_id
  ORDER BY s.id DESC
  LIMIT ${ENTRY_LIMIT}
`;

type ConnDeps = { getConnection: () => Promise<SqlConnection> };

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

let schemaReady: Promise<void> | undefined;
const touchedAt = new Map<string, number>();

export function resetUserSessionsForTests(): void {
  schemaReady = undefined;
  touchedAt.clear();
}

async function ensureColumn(
  connection: SqlConnection,
  columnName: string,
  addColumnSql: string,
): Promise<void> {
  const rows = await connection.query<{ COLUMN_NAME?: string }>(
    `SELECT COLUMN_NAME AS COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'user_sessions'
       AND COLUMN_NAME = ?`,
    [columnName],
  );
  if (rows.length > 0) return;
  await connection.execute(
    `ALTER TABLE user_sessions ADD COLUMN ${addColumnSql}`,
    [],
  );
}

async function runSchema(deps: ConnDeps): Promise<void> {
  const connection = await deps.getConnection();
  try {
    await connection.execute(SQL_CREATE, []);
    await ensureColumn(
      connection,
      "ip",
      "ip VARCHAR(45) NULL DEFAULT NULL AFTER last_seen_at",
    );
    await ensureColumn(
      connection,
      "user_agent",
      "user_agent VARCHAR(255) NULL DEFAULT NULL AFTER ip",
    );
  } finally {
    connection.release();
  }
}

export async function ensureUserSessionsSchema(
  deps: ConnDeps = { getConnection: loadDefaultConnection },
): Promise<void> {
  if (!schemaReady) {
    schemaReady = runSchema(deps).catch((error) => {
      schemaReady = undefined;
      throw error;
    });
  }
  await schemaReady;
}

export type LoginRequestMeta = {
  ip: string | null;
  userAgent: string | null;
};

export async function readLoginRequestMeta(): Promise<LoginRequestMeta> {
  try {
    const { headers } = await import("next/headers");
    const incoming = await headers();
    return {
      ip: loginClientIp(incoming),
      userAgent: loginUserAgent(incoming),
    };
  } catch (error) {
    console.error("readLoginRequestMeta failed", error);
    return { ip: null, userAgent: null };
  }
}

export async function openLoginSession(
  userId: number,
  options: {
    expiresAtSec: number;
    meta?: LoginRequestMeta;
    readMeta?: () => Promise<LoginRequestMeta>;
  },
  deps: ConnDeps = { getConnection: loadDefaultConnection },
): Promise<{ id: number }> {
  if (!Number.isInteger(userId) || userId <= 0) {
    throw new Error("Invalid user id.");
  }
  if (!Number.isInteger(options.expiresAtSec) || options.expiresAtSec <= 0) {
    throw new Error("Invalid session expiry.");
  }
  const meta = options.meta ?? (await (options.readMeta ?? readLoginRequestMeta)());
  await ensureUserSessionsSchema(deps);
  const connection = await deps.getConnection();
  try {
    const result = await connection.execute(SQL_INSERT, [
      userId,
      options.expiresAtSec,
      meta.ip,
      meta.userAgent,
    ]);
    const id = Number(result.insertId);
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error("Login session was not stored.");
    }
    touchedAt.set(`${userId}:${id}`, Date.now());
    return { id };
  } finally {
    connection.release();
  }
}

/**
 * Refreshes one open session and `app_users.last_seen_at`.
 * No-op when the row is revoked, expired, or already fresh.
 */
export async function touchLoginSession(
  userId: number,
  sessionId: number,
  deps: ConnDeps = { getConnection: loadDefaultConnection },
  nowMs = Date.now(),
): Promise<void> {
  if (!Number.isInteger(userId) || userId <= 0) return;
  if (!Number.isInteger(sessionId) || sessionId <= 0) return;
  const key = `${userId}:${sessionId}`;
  const previous = touchedAt.get(key);
  if (
    previous !== undefined &&
    nowMs - previous < PRESENCE_TOUCH_GAP_SEC * 1000
  ) {
    return;
  }
  await ensureUserSessionsSchema(deps);
  const connection = await deps.getConnection();
  try {
    const updated = await connection.execute(SQL_TOUCH, [sessionId, userId]);
    if (updated.affectedRows > 0) {
      await connection.execute(SQL_TOUCH_USER, [userId]);
    }
    touchedAt.set(key, nowMs);
  } catch (error) {
    touchedAt.delete(key);
    throw error;
  } finally {
    connection.release();
  }
}

export async function revokeLoginSession(
  sessionId: number,
  userId: number,
  deps: ConnDeps = { getConnection: loadDefaultConnection },
): Promise<void> {
  if (!Number.isInteger(sessionId) || sessionId <= 0) return;
  if (!Number.isInteger(userId) || userId <= 0) return;
  await ensureUserSessionsSchema(deps);
  const connection = await deps.getConnection();
  try {
    await connection.execute(SQL_REVOKE, [sessionId, userId]);
    touchedAt.delete(`${userId}:${sessionId}`);
  } finally {
    connection.release();
  }
}

export type LoginEntry = {
  id: number;
  userId: number;
  displayName: string;
  login: string;
  createdAt: string;
  ip: string | null;
  userAgent: string | null;
};

type EntryRow = {
  id: number;
  user_id: number;
  created_at: Date | string;
  ip: string | null;
  user_agent: string | null;
  display_name: string;
  login: string;
};

function stamp(value: Date | string): string {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

export async function listRecentLoginEntries(
  deps: ConnDeps = { getConnection: loadDefaultConnection },
): Promise<LoginEntry[]> {
  await ensureUserSessionsSchema(deps);
  const connection = await deps.getConnection();
  try {
    const rows = await connection.query<EntryRow>(SQL_LIST, []);
    return rows.map((row) => ({
      id: Number(row.id),
      userId: Number(row.user_id),
      displayName: row.display_name?.trim() || row.login,
      login: row.login,
      createdAt: stamp(row.created_at),
      ip: row.ip?.trim() || null,
      userAgent: row.user_agent?.trim() || null,
    }));
  } finally {
    connection.release();
  }
}
