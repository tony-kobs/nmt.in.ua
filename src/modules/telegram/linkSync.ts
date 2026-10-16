import type { SqlConnection } from "@/lib/db/mysql";
import { mysqlErrno } from "@/modules/teacher-students/mysqlErrno";

const CHAT_ID = /^[1-9][0-9]{0,19}$/;

function missingRelation(error: unknown): boolean {
  const errno = mysqlErrno(error);
  return errno === 1146 || errno === 1054;
}

/**
 * One-way copies that are safe to repeat.
 * A marathon chat without an account row becomes the account (private chat: user id = chat id).
 * An account chat fills participant rows that never stored one.
 * A chat already owned by another account is left alone.
 */
export async function backfillTelegramLinks(connection: SqlConnection): Promise<void> {
  try {
    await connection.execute(
      `INSERT IGNORE INTO user_telegram_accounts
         (user_id, telegram_user_id, telegram_chat_id)
       SELECT src.user_id, src.chat_id, src.chat_id
       FROM (
         SELECT p.user_id, MIN(p.telegram_chat_id) AS chat_id
         FROM marathon_participants p
         INNER JOIN app_users u ON u.id = p.user_id AND u.is_banned = 0
         WHERE p.telegram_chat_id IS NOT NULL AND p.telegram_chat_id > 0
         GROUP BY p.user_id
       ) src
       LEFT JOIN user_telegram_accounts by_user ON by_user.user_id = src.user_id
       LEFT JOIN user_telegram_accounts by_identity ON by_identity.telegram_user_id = src.chat_id
       WHERE by_user.id IS NULL AND by_identity.id IS NULL`,
      [],
    );
  } catch (error) {
    if (!missingRelation(error)) throw error;
  }
  try {
    await connection.execute(
      `UPDATE marathon_participants p
       INNER JOIN user_telegram_accounts a ON a.user_id = p.user_id
       SET p.telegram_chat_id = a.telegram_chat_id
       WHERE p.telegram_chat_id IS NULL AND a.telegram_chat_id IS NOT NULL`,
      [],
    );
  } catch (error) {
    if (!missingRelation(error)) throw error;
  }
}

export function usableChatId(value: unknown): string | null {
  if (value == null) return null;
  const chatId = String(value);
  return CHAT_ID.test(chatId) ? chatId : null;
}

/** Repair one user. Schema ensure already ran the bulk copy; this covers a later link. */
export async function repairUserTelegramLink(
  connection: SqlConnection,
  userId: number,
): Promise<void> {
  const accounts = await connection.query<{
    telegram_chat_id?: number | string | null;
    telegram_user_id?: number | string | null;
  }>(
    `SELECT telegram_chat_id, telegram_user_id
     FROM user_telegram_accounts WHERE user_id = ? LIMIT 1`,
    [userId],
  );
  const account = accounts[0];
  const accountChat = account
    ? usableChatId(account.telegram_chat_id) ?? usableChatId(account.telegram_user_id)
    : null;
  if (accountChat) {
    try {
      await connection.execute(
        `UPDATE marathon_participants
         SET telegram_chat_id = ?
         WHERE user_id = ? AND telegram_chat_id IS NULL`,
        [accountChat, userId],
      );
    } catch (error) {
      if (!missingRelation(error)) throw error;
    }
    return;
  }
  let participantChat: string | null = null;
  try {
    const rows = await connection.query<{ telegram_chat_id: number | string | null }>(
      `SELECT telegram_chat_id
       FROM marathon_participants
       WHERE user_id = ? AND telegram_chat_id IS NOT NULL AND telegram_chat_id > 0
       ORDER BY telegram_selected_at IS NULL, telegram_selected_at DESC, marathon_id DESC
       LIMIT 1`,
      [userId],
    );
    participantChat = usableChatId(rows[0]?.telegram_chat_id);
  } catch (error) {
    if (!missingRelation(error)) throw error;
    return;
  }
  if (!participantChat) return;
  try {
    await connection.execute(
      `INSERT INTO user_telegram_accounts
         (user_id, telegram_user_id, telegram_chat_id)
       SELECT ?, ?, ?
       FROM DUAL
       WHERE NOT EXISTS (SELECT 1 FROM user_telegram_accounts WHERE user_id = ?)
         AND NOT EXISTS (SELECT 1 FROM user_telegram_accounts WHERE telegram_user_id = ?)`,
      [userId, participantChat, participantChat, userId, participantChat],
    );
  } catch (error) {
    const errno = mysqlErrno(error);
    if (errno === 1062 || missingRelation(error)) return;
    throw error;
  }
}
