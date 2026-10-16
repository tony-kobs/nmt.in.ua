import "server-only";

import { createHash, randomBytes } from "node:crypto";
import type { SqlConnection } from "@/lib/db/mysql";
import { ensureTelegramSchema, loadTelegramConnection } from "./schema";

const TOKEN_TTL_MS = 10 * 60 * 1000;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const ID_PATTERN = /^[1-9][0-9]{0,19}$/;

type LinkDeps = {
  getConnection: () => Promise<SqlConnection>;
  now: () => Date;
};

const defaultDeps: LinkDeps = {
  getConnection: loadTelegramConnection,
  now: () => new Date(),
};

export function mintTelegramLinkToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashTelegramLinkToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export async function createTelegramLink(
  userId: number,
  botUsername: string,
  deps: LinkDeps = defaultDeps,
): Promise<string> {
  if (!Number.isSafeInteger(userId) || userId <= 0 || !/^[A-Za-z0-9_]{5,32}$/.test(botUsername)) {
    throw new Error("Invalid Telegram linking input.");
  }
  await ensureTelegramSchema(deps.getConnection);
  const connection = await deps.getConnection();
  const token = mintTelegramLinkToken();
  try {
    await connection.beginTransaction();
    const users = await connection.query<{ id: number; is_banned: number }>(
      "SELECT id, is_banned FROM app_users WHERE id = ? LIMIT 1 FOR UPDATE",
      [userId],
    );
    if (!users[0] || users[0].is_banned) throw new Error("Account unavailable for Telegram linking.");
    const linked = await connection.query<{ id: number }>(
      "SELECT id FROM user_telegram_accounts WHERE user_id = ? LIMIT 1",
      [userId],
    );
    if (linked.length) throw new Error("Telegram account already linked.");
    await connection.execute(
      "UPDATE telegram_link_tokens SET consumed_at = CURRENT_TIMESTAMP WHERE user_id = ? AND consumed_at IS NULL",
      [userId],
    );
    await connection.execute(
      "INSERT INTO telegram_link_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)",
      [userId, hashTelegramLinkToken(token), new Date(deps.now().getTime() + TOKEN_TTL_MS)],
    );
    await connection.commit();
    return `https://t.me/${botUsername}?start=${token}`;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function getTelegramLinkStatus(
  userId: number,
  deps: Pick<LinkDeps, "getConnection"> = defaultDeps,
): Promise<boolean> {
  await ensureTelegramSchema(deps.getConnection);
  const connection = await deps.getConnection();
  try {
    const rows = await connection.query<{ id: number }>(
      "SELECT id FROM user_telegram_accounts WHERE user_id = ? LIMIT 1",
      [userId],
    );
    return rows.length > 0;
  } finally {
    connection.release();
  }
}

export async function getTelegramLinkRecord(
  userId: number,
  deps: Pick<LinkDeps, "getConnection"> = defaultDeps,
): Promise<{ chatId: string; username: string | null } | null> {
  if (!Number.isSafeInteger(userId) || userId <= 0) return null;
  await ensureTelegramSchema(deps.getConnection);
  const connection = await deps.getConnection();
  try {
    const rows = await connection.query<{
      telegram_chat_id: number | string | null;
      telegram_username: string | null;
    }>(
      "SELECT telegram_chat_id, telegram_username FROM user_telegram_accounts WHERE user_id = ? LIMIT 1",
      [userId],
    );
    const row = rows[0];
    if (!row || row.telegram_chat_id == null) return null;
    const chatId = String(row.telegram_chat_id);
    if (!/^[1-9][0-9]{0,19}$/.test(chatId)) return null;
    const raw = typeof row.telegram_username === "string"
      ? row.telegram_username.replace(/^@/, "")
      : "";
    return {
      chatId,
      username: /^[A-Za-z0-9_]{5,32}$/.test(raw) ? raw : null,
    };
  } finally {
    connection.release();
  }
}

export type TelegramIdentity = {
  userId: string;
  chatId: string;
  username?: string;
};

export async function consumeTelegramLink(
  rawToken: string,
  identity: TelegramIdentity,
  deps: LinkDeps = defaultDeps,
): Promise<boolean> {
  if (!TOKEN_PATTERN.test(rawToken) || !ID_PATTERN.test(identity.userId) ||
      !ID_PATTERN.test(identity.chatId) ||
      (identity.username !== undefined && !/^[A-Za-z0-9_]{5,32}$/.test(identity.username))) {
    return false;
  }
  await ensureTelegramSchema(deps.getConnection);
  const connection = await deps.getConnection();
  try {
    await connection.beginTransaction();
    const rows = await connection.query<{
      id: number;
      user_id: number;
      expires_at: Date | string;
      consumed_at: Date | string | null;
    }>(
      "SELECT id, user_id, expires_at, consumed_at FROM telegram_link_tokens WHERE token_hash = ? LIMIT 1 FOR UPDATE",
      [hashTelegramLinkToken(rawToken)],
    );
    const row = rows[0];
    const expiresAt = row ? new Date(row.expires_at).getTime() : NaN;
    if (!row || row.consumed_at || !Number.isFinite(expiresAt) || expiresAt <= deps.now().getTime()) {
      await connection.rollback();
      return false;
    }
    const users = await connection.query<{ id: number; is_banned: number }>(
      "SELECT id, is_banned FROM app_users WHERE id = ? LIMIT 1 FOR UPDATE",
      [row.user_id],
    );
    if (!users[0] || users[0].is_banned) {
      await connection.rollback();
      return false;
    }
    const existing = await connection.query<{ user_id: number; telegram_user_id: string }>(
      "SELECT user_id, telegram_user_id FROM user_telegram_accounts WHERE user_id = ? OR telegram_user_id = ? FOR UPDATE",
      [row.user_id, identity.userId],
    );
    if (existing.length) {
      await connection.rollback();
      return false;
    }
    await connection.execute(
      "INSERT INTO user_telegram_accounts (user_id, telegram_user_id, telegram_chat_id, telegram_username) VALUES (?, ?, ?, ?)",
      [row.user_id, identity.userId, identity.chatId, identity.username ?? null],
    );
    await connection.execute(
      "UPDATE telegram_link_tokens SET consumed_at = CURRENT_TIMESTAMP WHERE id = ?",
      [row.id],
    );
    await connection.commit();
    return true;
  } catch (error) {
    await connection.rollback();
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ER_DUP_ENTRY") {
      return false;
    }
    throw error;
  } finally {
    connection.release();
  }
}
