import "server-only";

import { createHash, randomBytes } from "node:crypto";
import type { SqlConnection } from "@/lib/db/mysql";
import { repairUserTelegramLink, usableChatId } from "./linkSync";
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

export type TelegramLink = {
  linked: boolean;
  chatId: string | null;
  username: string | null;
};

const UNLINKED: TelegramLink = { linked: false, chatId: null, username: null };

function usernameOf(value: unknown): string | null {
  const raw = typeof value === "string" ? value.replace(/^@/, "") : "";
  return /^[A-Za-z0-9_]{5,32}$/.test(raw) ? raw : null;
}

/**
 * Single source for “is Telegram linked”.
 * An account row and a marathon chat id are the same link: a missing account is filled
 * from the participant chat, and a missing participant chat is filled from the account.
 */
export async function getTelegramLink(
  userId: number,
  deps: Pick<LinkDeps, "getConnection"> = defaultDeps,
): Promise<TelegramLink> {
  if (!Number.isSafeInteger(userId) || userId <= 0) return UNLINKED;
  await ensureTelegramSchema(deps.getConnection);
  const connection = await deps.getConnection();
  try {
    await repairUserTelegramLink(connection, userId);
    const rows = await connection.query<{
      telegram_chat_id?: number | string | null;
      telegram_user_id?: number | string | null;
      telegram_username?: string | null;
    }>(
      `SELECT telegram_chat_id, telegram_user_id, telegram_username
       FROM user_telegram_accounts WHERE user_id = ? LIMIT 1`,
      [userId],
    );
    const row = rows[0];
    if (row) {
      const chatId = usableChatId(row.telegram_chat_id) ?? usableChatId(row.telegram_user_id);
      if (chatId) {
        return { linked: true, chatId, username: usernameOf(row.telegram_username) };
      }
    }
    try {
      const participants = await connection.query<{ telegram_chat_id: number | string | null }>(
        `SELECT telegram_chat_id FROM marathon_participants
         WHERE user_id = ? AND telegram_chat_id IS NOT NULL
         ORDER BY marathon_id DESC LIMIT 1`,
        [userId],
      );
      const chatId = usableChatId(participants[0]?.telegram_chat_id);
      if (chatId) return { linked: true, chatId, username: null };
    } catch (error) {
      const errno = typeof error === "object" && error && "errno" in error
        ? Number((error as { errno?: number }).errno)
        : 0;
      if (errno !== 1146 && errno !== 1054) throw error;
    }
    return UNLINKED;
  } finally {
    connection.release();
  }
}

export async function getTelegramLinkStatus(
  userId: number,
  deps: Pick<LinkDeps, "getConnection"> = defaultDeps,
): Promise<boolean> {
  return (await getTelegramLink(userId, deps)).linked;
}

export async function getTelegramLinkRecord(
  userId: number,
  deps: Pick<LinkDeps, "getConnection"> = defaultDeps,
): Promise<{ chatId: string; username: string | null } | null> {
  const link = await getTelegramLink(userId, deps);
  if (!link.linked || !link.chatId) return null;
  return { chatId: link.chatId, username: link.username };
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
    try {
      await connection.execute(
        `UPDATE marathon_participants
         SET telegram_chat_id = ?
         WHERE user_id = ? AND (telegram_chat_id IS NULL OR telegram_chat_id = 0)`,
        [identity.chatId, row.user_id],
      );
    } catch (error) {
      const errno = typeof error === "object" && error && "errno" in error
        ? Number((error as { errno?: number }).errno)
        : 0;
      if (errno !== 1146 && errno !== 1054) throw error;
    }
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
