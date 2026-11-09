import "server-only";

import { MARATHON_SELECT, mapMarathon, mapParticipant, withConn, type Conn } from "./db";
import type { DailyMarathon, Participant } from "./types";

export async function getParticipant(
  marathonId: number,
  userId: number,
  getConnection?: Conn,
): Promise<Participant | null> {
  return withConn(async (connection) => {
    const rows = await connection.query<{
      user_id: number;
      source: string | null;
      streak: number;
      finished_at: unknown;
      converted_at: unknown;
      telegram_chat_id: number | string | null;
      notify_email: number;
      notify_bot: number;
      delivery_channel: string | null;
      intro_seen_at: unknown;
      notify_paused: number;
      email: string | null;
      display_name: string | null;
    }>(
      `SELECT p.user_id, p.source, p.streak, p.finished_at, p.converted_at,
              p.telegram_chat_id, p.notify_email, p.notify_bot, p.delivery_channel,
              p.intro_seen_at, p.notify_paused, npref.email_on AS pref_email,
              npref.telegram_on AS pref_telegram, u.email, u.display_name
       FROM marathon_participants p
       INNER JOIN app_users u ON u.id = p.user_id
       LEFT JOIN user_channel_preferences npref
         ON npref.user_id = p.user_id AND npref.category = 'marathon'
       WHERE p.marathon_id = ? AND p.user_id = ? LIMIT 1`,
      [marathonId, userId],
    );
    const row = rows[0];
    if (!row) return null;
    return mapParticipant(row);
  }, getConnection);
}

export async function findParticipantByChat(
  chatId: string,
  getConnection?: Conn,
): Promise<{ marathon: DailyMarathon; participant: Participant } | null> {
  if (!/^[1-9][0-9]{0,19}$/.test(chatId)) return null;
  return withConn(async (connection) => {
    const rows = await connection.query<{ marathon_id: number }>(
      `SELECT p.marathon_id
       FROM marathon_participants p
       INNER JOIN marathons m ON m.id = p.marathon_id
       WHERE p.telegram_chat_id = ? AND m.kind = 'daily' AND m.status IN ('active', 'finished')
       ORDER BY (p.telegram_selected_at IS NULL) ASC, p.telegram_selected_at DESC,
                (m.status = 'active') DESC, (p.delivery_channel = 'telegram') DESC, p.joined_at DESC
       LIMIT 1`,
      [chatId],
    );
    const id = rows[0]?.marathon_id;
    if (!id) return null;
    const marathonRows = await connection.query<Parameters<typeof mapMarathon>[0]>(
      `SELECT ${MARATHON_SELECT} FROM marathons WHERE id = ? AND kind = 'daily' LIMIT 1`,
      [id],
    );
    const marathon = marathonRows[0] ? mapMarathon(marathonRows[0]) : null;
    if (!marathon) return null;
    const people = await connection.query<Parameters<typeof mapParticipant>[0]>(
      `SELECT p.user_id, p.source, p.streak, p.finished_at, p.converted_at,
              p.telegram_chat_id, p.notify_email, p.notify_bot, p.delivery_channel,
              p.intro_seen_at, p.notify_paused, npref.email_on AS pref_email,
              npref.telegram_on AS pref_telegram, u.email, u.display_name
       FROM marathon_participants p
       INNER JOIN app_users u ON u.id = p.user_id
       LEFT JOIN user_channel_preferences npref
         ON npref.user_id = p.user_id AND npref.category = 'marathon'
       WHERE p.marathon_id = ? AND p.telegram_chat_id = ?
       LIMIT 1`,
      [id, chatId],
    );
    const participant = people[0] ? mapParticipant(people[0]) : null;
    if (!participant) return null;
    return { marathon, participant };
  }, getConnection);
}

/** Archived course still linked to this chat, when no active or finished course is. */
export async function findArchivedMarathonByChat(
  chatId: string,
  getConnection?: Conn,
): Promise<{ id: number; title: string; displayName: string } | null> {
  if (!/^[1-9][0-9]{0,19}$/.test(chatId)) return null;
  return withConn(async (connection) => {
    const rows = await connection.query<{ id: number; title: string; display_name: string | null }>(
      `SELECT m.id, m.title, u.display_name
       FROM marathon_participants p
       INNER JOIN marathons m ON m.id = p.marathon_id
       INNER JOIN app_users u ON u.id = p.user_id
       WHERE p.telegram_chat_id = ? AND m.kind = 'daily' AND m.status = 'archived'
       ORDER BY p.joined_at DESC
       LIMIT 1`,
      [chatId],
    );
    const row = rows[0];
    if (!row) return null;
    return { id: Number(row.id), title: row.title, displayName: String(row.display_name ?? "") };
  }, getConnection);
}

export async function listChatMarathons(
  chatId: string,
  getConnection?: Conn,
): Promise<Array<{ id: number; title: string }>> {
  if (!/^[1-9][0-9]{0,19}$/.test(chatId)) return [];
  return withConn(async (connection) => {
    const rows = await connection.query<{ id: number; title: string }>(
      `SELECT m.id, m.title
       FROM marathon_participants p
       INNER JOIN marathons m ON m.id = p.marathon_id
       WHERE p.telegram_chat_id = ? AND m.kind = 'daily' AND m.status IN ('active', 'finished')
       ORDER BY (p.telegram_selected_at IS NULL) ASC, p.telegram_selected_at DESC, m.id DESC`,
      [chatId],
    );
    return rows.map((row) => ({ id: Number(row.id), title: row.title }));
  }, getConnection);
}

export async function selectChatMarathon(
  chatId: string,
  marathonId: number,
  getConnection?: Conn,
): Promise<boolean> {
  if (!/^[1-9][0-9]{0,19}$/.test(chatId) || !Number.isInteger(marathonId) || marathonId <= 0) {
    return false;
  }
  return withConn(async (connection) => {
    const result = await connection.execute(
      `UPDATE marathon_participants
       SET telegram_selected_at = CURRENT_TIMESTAMP
       WHERE marathon_id = ? AND telegram_chat_id = ?`,
      [marathonId, chatId],
    );
    return result.affectedRows === 1;
  }, getConnection);
}

export async function joinParticipant(
  marathonId: number,
  userId: number,
  source: string | null,
  getConnection?: Conn,
): Promise<void> {
  await withConn(async (connection) => {
    await connection.execute(
      `INSERT IGNORE INTO marathon_participants (marathon_id, user_id, source) VALUES (?, ?, ?)`,
      [marathonId, userId, source],
    );
    await connection.execute(
      `DELETE FROM marathon_declines WHERE marathon_id = ? AND user_id = ?`,
      [marathonId, userId],
    );
    if (source) {
      await connection.execute(
        `UPDATE marathon_participants SET source = ?
         WHERE marathon_id = ? AND user_id = ? AND source IS NULL`,
        [source, marathonId, userId],
      );
    }
  }, getConnection);
}
