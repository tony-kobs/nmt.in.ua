import "server-only";

import type { SqlConnection } from "@/lib/db/mysql";
import { mysqlErrno } from "@/modules/teacher-students/mysqlErrno";
import { usableChatId } from "./linkSync";
import { ensureTelegramSchema, loadTelegramConnection } from "./schema";
import { sendTelegramMessage } from "./transport";

/** Stored on a cancelled outbox or job row. The timeline shows this as «Пропущено». */
export const UNLINK_REASON = "Telegram відв’язано";

/** Best-effort note to the chat that was just disconnected. */
export const UNLINK_NOTICE = "Бота відв'язано від акаунта nmt.in.ua";

export type UnlinkResult = {
  /** True when an account row or a participant chat was cleared. */
  unlinked: boolean;
  chatIds: string[];
};

type UnlinkDeps = {
  getConnection: () => Promise<SqlConnection>;
  notify?: (chatId: string, text: string) => Promise<void>;
};

const defaultDeps: UnlinkDeps = {
  getConnection: loadTelegramConnection,
};

function missingRelation(error: unknown): boolean {
  const errno = mysqlErrno(error);
  return errno === 1146 || errno === 1054;
}

async function ignoreMissing(work: () => Promise<void>): Promise<void> {
  try {
    await work();
  } catch (error) {
    if (!missingRelation(error)) throw error;
  }
}

async function executeSkip(
  connection: SqlConnection,
  primary: { sql: string; params: unknown[] },
  fallback: { sql: string; params: unknown[] },
): Promise<void> {
  try {
    await connection.execute(primary.sql, primary.params);
  } catch (error) {
    if (mysqlErrno(error) !== 1054) throw error;
    await connection.execute(fallback.sql, fallback.params);
  }
}

function addChat(target: Set<string>, value: unknown): void {
  const chatId = usableChatId(value);
  if (chatId) target.add(chatId);
}

async function defaultNotify(chatId: string, text: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) return;
  const result = await sendTelegramMessage({ chatId, text }, token);
  if (result.status !== "sent") {
    console.error("telegram unlink notice was not delivered", result.status);
  }
}

/**
 * Drops the current user's Telegram link.
 * Both stores are cleared together, otherwise the next read repairs the link
 * from the participant chat. Pending tokens are consumed. Pending outbox rows
 * and queued Telegram jobs are cancelled with a reason. Scores stay.
 */
export async function unlinkTelegramAccount(
  userId: number,
  deps: UnlinkDeps = defaultDeps,
): Promise<UnlinkResult> {
  if (!Number.isSafeInteger(userId) || userId <= 0) {
    return { unlinked: false, chatIds: [] };
  }
  await ensureTelegramSchema(deps.getConnection);
  const connection = await deps.getConnection();
  const chatIds = new Set<string>();
  let unlinked = false;
  try {
    await connection.beginTransaction();
    const users = await connection.query<{ id: number }>(
      "SELECT id FROM app_users WHERE id = ? LIMIT 1 FOR UPDATE",
      [userId],
    );
    if (!users[0]) {
      await connection.rollback();
      return { unlinked: false, chatIds: [] };
    }
    const accounts = await connection.query<{
      telegram_chat_id?: number | string | null;
      telegram_user_id?: number | string | null;
    }>(
      `SELECT telegram_chat_id, telegram_user_id
       FROM user_telegram_accounts WHERE user_id = ? LIMIT 1 FOR UPDATE`,
      [userId],
    );
    if (accounts[0]) {
      addChat(chatIds, accounts[0].telegram_chat_id);
      addChat(chatIds, accounts[0].telegram_user_id);
      unlinked = true;
    }
    try {
      const participants = await connection.query<{ telegram_chat_id: number | string | null }>(
        `SELECT telegram_chat_id FROM marathon_participants
         WHERE user_id = ? AND telegram_chat_id IS NOT NULL FOR UPDATE`,
        [userId],
      );
      for (const row of participants) {
        if (usableChatId(row.telegram_chat_id)) unlinked = true;
        addChat(chatIds, row.telegram_chat_id);
      }
    } catch (error) {
      if (!missingRelation(error)) throw error;
    }
    await connection.execute(
      "DELETE FROM user_telegram_accounts WHERE user_id = ?",
      [userId],
    );
    await ignoreMissing(async () => {
      await connection.execute(
        "UPDATE marathon_participants SET telegram_chat_id = NULL WHERE user_id = ?",
        [userId],
      );
    });
    await ignoreMissing(async () => {
      await connection.execute(
        "UPDATE telegram_link_tokens SET consumed_at = CURRENT_TIMESTAMP WHERE user_id = ? AND consumed_at IS NULL",
        [userId],
      );
    });
    await ignoreMissing(async () => {
      await connection.execute(
        "UPDATE marathon_bot_links SET consumed_at = CURRENT_TIMESTAMP WHERE user_id = ? AND consumed_at IS NULL",
        [userId],
      );
    });
    const chats = [...chatIds];
    if (chats.length > 0) {
      const marks = chats.map(() => "?").join(", ");
      await ignoreMissing(() => executeSkip(
        connection,
        {
          sql: `UPDATE marathon_telegram_outbox
                SET status = 'cancelled', error_text = ?, hold_reason = NULL
                WHERE status = 'pending' AND chat_id IN (${marks})`,
          params: [UNLINK_REASON, ...chats],
        },
        {
          sql: `UPDATE marathon_telegram_outbox
                SET status = 'cancelled'
                WHERE status = 'pending' AND chat_id IN (${marks})`,
          params: chats,
        },
      ));
    }
    await ignoreMissing(() => executeSkip(
      connection,
      {
        sql: `UPDATE marathon_message_jobs
              SET status = 'cancelled', error_text = ?
              WHERE user_id = ? AND channel = 'telegram' AND status IN ('queued', 'sending')`,
        params: [UNLINK_REASON, userId],
      },
      {
        sql: `UPDATE marathon_message_jobs
              SET status = 'cancelled'
              WHERE user_id = ? AND channel = 'telegram' AND status IN ('queued', 'sending')`,
        params: [userId],
      },
    ));
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  const notify = deps.notify ?? defaultNotify;
  for (const chatId of chatIds) {
    try {
      await notify(chatId, UNLINK_NOTICE);
    } catch (error) {
      console.error("telegram unlink notice failed", error);
    }
  }
  return { unlinked, chatIds: [...chatIds] };
}
