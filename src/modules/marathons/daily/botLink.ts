import "server-only";

import { createHash, randomBytes } from "node:crypto";
import type { SqlConnection } from "@/lib/db/mysql";
import { saveUserChannelPreference } from "@/modules/notifications/channelStore";

export const MARATHON_START_PREFIX = "mth_";
const TOKEN_TTL_MS = 30 * 60 * 1000;

export function isMarathonStartPayload(payload: string): boolean {
  return payload.startsWith(MARATHON_START_PREFIX) && payload.length !== 43;
}

export function mintMarathonStartCode(): string {
  return `${MARATHON_START_PREFIX}${randomBytes(24).toString("base64url")}`;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

export function optionalTelegramBot(): { token: string; username: string } | null {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const username = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "").trim();
  if (!token || !username || !/^[A-Za-z0-9_]{5,32}$/.test(username)) return null;
  return { token, username };
}

export async function createMarathonBotLink(
  marathonId: number,
  userId: number,
  getConnection: () => Promise<SqlConnection> = loadDefaultConnection,
): Promise<string | null> {
  const bot = optionalTelegramBot();
  if (!bot) return null;
  const { ensureMarathonSchema } = await import("../schema");
  await ensureMarathonSchema(getConnection);
  const connection = await getConnection();
  const code = mintMarathonStartCode();
  try {
    await connection.execute(
      `INSERT INTO marathon_bot_links (marathon_id, user_id, token_hash, expires_at)
       VALUES (?, ?, ?, ?)`,
      [marathonId, userId, hashToken(code), new Date(Date.now() + TOKEN_TTL_MS)],
    );
  } finally {
    connection.release();
  }
  return `https://t.me/${bot.username}?start=${code}`;
}

export async function consumeMarathonStart(
  rawToken: string,
  identity: { userId: string; chatId: string; username?: string },
  getConnection: () => Promise<SqlConnection> = loadDefaultConnection,
): Promise<boolean> {
  if (!isMarathonStartPayload(rawToken)) return false;
  if (!/^[1-9][0-9]{0,19}$/.test(identity.userId)) return false;
  if (!/^[1-9][0-9]{0,19}$/.test(identity.chatId)) return false;
  const { ensureMarathonSchema } = await import("../schema");
  const { ensureTelegramSchema } = await import("@/modules/telegram/schema");
  await ensureMarathonSchema(getConnection);
  await ensureTelegramSchema(getConnection);
  const connection = await getConnection();
  let notice: { marathonId: number; userId: number } | null = null;
  try {
    await connection.beginTransaction();
    const rows = await connection.query<{
      id: number;
      marathon_id: number;
      user_id: number;
      expires_at: Date | string;
      consumed_at: Date | string | null;
    }>(
      `SELECT id, marathon_id, user_id, expires_at, consumed_at
       FROM marathon_bot_links WHERE token_hash = ? LIMIT 1 FOR UPDATE`,
      [hashToken(rawToken)],
    );
    const row = rows[0];
    const expiresAt = row ? new Date(row.expires_at).getTime() : NaN;
    if (!row || row.consumed_at || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      await connection.rollback();
      return false;
    }
    const users = await connection.query<{ id: number; is_banned: number }>(
      `SELECT id, is_banned FROM app_users WHERE id = ? LIMIT 1`,
      [row.user_id],
    );
    if (!users[0] || users[0].is_banned) {
      await connection.rollback();
      return false;
    }
    const paused = await connection.query<{ notify_paused: number }>(
      `SELECT notify_paused FROM marathon_participants
       WHERE marathon_id = ? AND user_id = ? LIMIT 1 FOR UPDATE`,
      [row.marathon_id, row.user_id],
    );
    await connection.execute(
      `UPDATE marathon_participants
       SET telegram_chat_id = ?,
           telegram_selected_at = CURRENT_TIMESTAMP
       WHERE marathon_id = ? AND user_id = ?`,
      [identity.chatId, row.marathon_id, row.user_id],
    );
    if (!paused[0] || Number(paused[0].notify_paused) === 0) {
      const pref = await connection.query<{ email_on: number }>(
        `SELECT email_on FROM user_channel_preferences
         WHERE user_id = ? AND category = 'marathon' LIMIT 1`,
        [row.user_id],
      );
      await saveUserChannelPreference(connection, row.user_id, "marathon", {
        email: pref[0] ? Number(pref[0].email_on) !== 0 : true,
        telegram: true,
      });
    }
    const linked = await connection.query<{ user_id: number; telegram_user_id: number | string }>(
      `SELECT user_id, telegram_user_id FROM user_telegram_accounts
       WHERE user_id = ? OR telegram_user_id = ? FOR UPDATE`,
      [row.user_id, identity.userId],
    );
    const sameAccount = linked.length === 1
      && linked[0]?.user_id === row.user_id
      && String(linked[0].telegram_user_id) === identity.userId;
    if (linked.length === 0) {
      await connection.execute(
        `INSERT INTO user_telegram_accounts
           (user_id, telegram_user_id, telegram_chat_id, telegram_username)
         VALUES (?, ?, ?, ?)`,
        [row.user_id, identity.userId, identity.chatId, identity.username ?? null],
      );
    } else if (sameAccount) {
      await connection.execute(
        `UPDATE user_telegram_accounts
         SET telegram_chat_id = ?, telegram_username = COALESCE(?, telegram_username)
         WHERE user_id = ?`,
        [identity.chatId, identity.username ?? null, row.user_id],
      );
    }
    await connection.execute(
      `UPDATE marathon_bot_links SET consumed_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [row.id],
    );
    await connection.commit();
    notice = { marathonId: row.marathon_id, userId: row.user_id };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  if (notice) {
    try {
      const { notifyMarathonRegistration } = await import("./registrationDelivery");
      await notifyMarathonRegistration({
        marathonId: notice.marathonId,
        userId: notice.userId,
        event: "link",
        chatId: identity.chatId,
      });
    } catch (error) {
      console.error("marathon registration telegram", error);
    }
  }
  return notice != null;
}
