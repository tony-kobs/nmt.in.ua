import "server-only";

import { createHash, randomBytes } from "node:crypto";
import type { SqlConnection } from "@/lib/db/mysql";
import { ensureSchemaOnce } from "@/lib/db/schemaGuard";
import { ensureAuthSchema } from "@/modules/auth/users";

export type AuthTokenPurpose = "email_verify" | "password_reset";

const SQL_CREATE_AUTH_TOKENS = `
  CREATE TABLE IF NOT EXISTS auth_tokens (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id INT NOT NULL,
    purpose ENUM('email_verify', 'password_reset') NOT NULL,
    token_hash CHAR(64) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_auth_tokens_hash (token_hash),
    KEY idx_auth_tokens_user_purpose (user_id, purpose, created_at)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

export const AUTH_TOKEN_TTL_MS: Record<AuthTokenPurpose, number> = {
  email_verify: 24 * 60 * 60 * 1000,
  password_reset: 60 * 60 * 1000,
};

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

export async function ensureAuthTokenSchema(
  getConnection: () => Promise<SqlConnection> = loadDefaultConnection,
): Promise<void> {
  await ensureSchemaOnce(
    "auth_tokens",
    ["023_auth_tokens.sql"],
    getConnection,
    async (connection) => {
      await ensureAuthSchema({ getConnection });
      await connection.execute(SQL_CREATE_AUTH_TOKENS, []);
    },
  );
}

export function hashAuthToken(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

export function mintAuthTokenRaw(): string {
  return randomBytes(32).toString("base64url");
}

export type IssueAuthTokenResult = {
  rawToken: string;
  expiresAt: Date;
};

function isMissingParentUser(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const record = error as { errno?: number; code?: string };
  const errno = Number(record.errno);
  return (
    errno === 1452 ||
    errno === 1216 ||
    record.code === "ER_NO_REFERENCED_ROW_2" ||
    record.code === "ER_NO_REFERENCED_ROW"
  );
}

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

async function issueAuthTokenOnce(
  userId: number,
  purpose: AuthTokenPurpose,
  deps: { getConnection: () => Promise<SqlConnection> },
): Promise<IssueAuthTokenResult> {
  await ensureAuthTokenSchema(deps.getConnection);
  const connection = await deps.getConnection();
  const rawToken = mintAuthTokenRaw();
  const tokenHash = hashAuthToken(rawToken);
  const expiresAt = new Date(Date.now() + AUTH_TOKEN_TTL_MS[purpose]);

  try {
    await connection.beginTransaction();
    await connection.execute(
      `UPDATE auth_tokens
       SET used_at = CURRENT_TIMESTAMP
       WHERE user_id = ? AND purpose = ? AND used_at IS NULL`,
      [userId, purpose],
    );
    await connection.execute(
      `INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at)
       VALUES (?, ?, ?, ?)`,
      [userId, purpose, tokenHash, expiresAt],
    );
    await connection.commit();
    return { rawToken, expiresAt };
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // The insert failed before a transaction was open, or rollback itself failed.
    }
    throw error;
  } finally {
    connection.release();
  }
}

/**
 * Invalidates unused tokens of the same purpose, then inserts a new one.
 * Retries once when the parent user is not visible yet: registration commits
 * the account and then immediately asks for a token, and the FK can lose that race.
 */
export async function issueAuthToken(
  userId: number,
  purpose: AuthTokenPurpose,
  deps: { getConnection: () => Promise<SqlConnection> } = {
    getConnection: loadDefaultConnection,
  },
): Promise<IssueAuthTokenResult> {
  try {
    return await issueAuthTokenOnce(userId, purpose, deps);
  } catch (error) {
    if (!isMissingParentUser(error)) throw error;
    await sleep(100);
    return await issueAuthTokenOnce(userId, purpose, deps);
  }
}

export type ConsumeAuthTokenResult =
  | { ok: true; userId: number }
  | { ok: false; code: "invalid" | "expired" | "used"; userId?: number };

export async function consumeAuthToken(
  rawToken: string,
  purpose: AuthTokenPurpose,
  deps: { getConnection: () => Promise<SqlConnection> } = {
    getConnection: loadDefaultConnection,
  },
): Promise<ConsumeAuthTokenResult> {
  const trimmed = rawToken.trim();
  if (!trimmed) return { ok: false, code: "invalid" };

  await ensureAuthTokenSchema(deps.getConnection);
  const connection = await deps.getConnection();
  const tokenHash = hashAuthToken(trimmed);

  try {
    await connection.beginTransaction();
    const rows = await connection.query<{
      id: number;
      user_id: number;
      expires_at: Date | string;
      used_at: Date | string | null;
    }>(
      `SELECT id, user_id, expires_at, used_at
       FROM auth_tokens
       WHERE token_hash = ? AND purpose = ?
       LIMIT 1
       FOR UPDATE`,
      [tokenHash, purpose],
    );
    const row = rows[0];
    if (!row) {
      await connection.rollback();
      return { ok: false, code: "invalid" };
    }
    if (row.used_at) {
      await connection.rollback();
      return { ok: false, code: "used", userId: row.user_id };
    }
    const expires =
      row.expires_at instanceof Date
        ? row.expires_at
        : new Date(row.expires_at);
    if (Number.isNaN(expires.getTime()) || expires.getTime() <= Date.now()) {
      await connection.rollback();
      return { ok: false, code: "expired", userId: row.user_id };
    }

    await connection.execute(
      `UPDATE auth_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [row.id],
    );
    await connection.commit();
    return { ok: true, userId: row.user_id };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

/** Recent unused issues — for simple rate limiting. */
export async function countRecentAuthTokens(
  userId: number,
  purpose: AuthTokenPurpose,
  withinMs: number,
  deps: { getConnection: () => Promise<SqlConnection> } = {
    getConnection: loadDefaultConnection,
  },
): Promise<number> {
  await ensureAuthTokenSchema(deps.getConnection);
  const connection = await deps.getConnection();
  const since = new Date(Date.now() - withinMs);
  try {
    const rows = await connection.query<{ count: number }>(
      `SELECT COUNT(*) AS count
       FROM auth_tokens
       WHERE user_id = ? AND purpose = ? AND created_at >= ?`,
      [userId, purpose, since],
    );
    return Number(rows[0]?.count ?? 0);
  } finally {
    connection.release();
  }
}
