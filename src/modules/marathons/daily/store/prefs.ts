import "server-only";

import type { SqlConnection } from "@/lib/db/mysql";
import { saveUserChannelPreference } from "@/modules/notifications/channelStore";
import { isCopyKey, type CopyKey } from "../copy";
import { flag, withConn, type Conn } from "./db";

export async function setNotifyToggles(
  marathonId: number,
  userId: number,
  prefs: { notifyEmail: boolean; notifyBot: boolean },
  getConnection?: Conn,
): Promise<void> {
  const marker = prefs.notifyBot ? "telegram" : "site";
  await withConn(async (connection) => {
    await saveUserChannelPreference(connection, userId, "marathon", {
      email: prefs.notifyEmail,
      telegram: prefs.notifyBot,
    });
    await connection.execute(
      `UPDATE marathon_participants
       SET delivery_channel = ?, notify_paused = 0
       WHERE marathon_id = ? AND user_id = ?`,
      [marker, marathonId, userId],
    );
  }, getConnection);
}

/** @deprecated Use setNotifyToggles. Kept so a single bot button still enables one side. */
export async function setDeliveryChannel(
  marathonId: number,
  userId: number,
  channel: "site" | "telegram",
  _linked: boolean,
  getConnection?: Conn,
): Promise<void> {
  await setNotifyToggles(
    marathonId,
    userId,
    {
      notifyEmail: channel === "site",
      notifyBot: channel === "telegram",
    },
    getConnection,
  );
}

export async function markIntroSeen(
  marathonId: number,
  userId: number,
  now: Date,
  getConnection?: Conn,
): Promise<void> {
  await withConn(async (connection) => {
    await connection.execute(
      `UPDATE marathon_participants
       SET intro_seen_at = COALESCE(intro_seen_at, ?)
       WHERE marathon_id = ? AND user_id = ?`,
      [now, marathonId, userId],
    );
  }, getConnection);
}

export type MarathonPauseState = {
  marathonId: number;
  title: string;
  paused: boolean;
  status: "active" | "finished";
};

/**
 * Pause or resume one course. The account-wide «Марафони» toggles stay as they are,
 * so another marathon this person joined keeps sending.
 */
export async function setMarathonNotificationsPaused(
  marathonId: number,
  userId: number,
  paused: boolean,
  getConnection?: Conn,
): Promise<boolean> {
  return withConn(async (connection) => {
    const result = await connection.execute(
      `UPDATE marathon_participants
       SET notify_paused = ?
       WHERE marathon_id = ? AND user_id = ?`,
      [paused ? 1 : 0, marathonId, userId],
    );
    return result.affectedRows === 1;
  }, getConnection);
}

export async function pauseMarathonNotifications(
  marathonId: number,
  userId: number,
  getConnection?: Conn,
): Promise<void> {
  await setMarathonNotificationsPaused(marathonId, userId, true, getConnection);
}

/** Active and finished courses this account joined, for the bot's notification screen. */
export async function listMarathonPauseStates(
  userId: number,
  getConnection?: Conn,
): Promise<MarathonPauseState[]> {
  return withConn(async (connection) => {
    const rows = await connection.query<{
      id: number;
      title: string;
      status: string;
      notify_paused: number;
    }>(
      `SELECT m.id, m.title, m.status, p.notify_paused
       FROM marathon_participants p
       INNER JOIN marathons m ON m.id = p.marathon_id
       WHERE p.user_id = ? AND m.kind = 'daily' AND m.status IN ('active', 'finished')
       ORDER BY (m.status = 'active') DESC, m.start_date DESC, m.id DESC`,
      [userId],
    );
    return rows.flatMap((row) => {
      if (row.status !== "active" && row.status !== "finished") return [];
      const title = String(row.title ?? "").trim();
      return [{
        marathonId: Number(row.id),
        title: title || `Марафон ${row.id}`,
        paused: flag(row.notify_paused),
        status: row.status,
      }];
    });
  }, getConnection);
}

export async function loadMarathonCopy(
  marathonId: number,
  getConnection?: Conn,
): Promise<Partial<Record<CopyKey, string>>> {
  return withConn(async (connection) => readCopy(connection, marathonId), getConnection);
}

export async function saveMarathonCopy(
  marathonId: number,
  key: CopyKey,
  body: string,
  getConnection?: Conn,
): Promise<void> {
  await withConn(async (connection) => {
    await connection.execute(
      `INSERT INTO marathon_copy (marathon_id, copy_key, body) VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE body = VALUES(body)`,
      [marathonId, key, body],
    );
  }, getConnection);
}

export async function resetMarathonCopy(
  marathonId: number,
  key: CopyKey,
  getConnection?: Conn,
): Promise<void> {
  await withConn(async (connection) => {
    await connection.execute(
      `DELETE FROM marathon_copy WHERE marathon_id = ? AND copy_key = ?`,
      [marathonId, key],
    );
  }, getConnection);
}

async function readCopy(
  connection: SqlConnection,
  marathonId: number,
): Promise<Partial<Record<CopyKey, string>>> {
  const rows = await connection.query<{ copy_key: string; body: string }>(
    `SELECT copy_key, body FROM marathon_copy WHERE marathon_id = ?`,
    [marathonId],
  );
  const copy: Partial<Record<CopyKey, string>> = {};
  for (const row of rows) {
    if (isCopyKey(row.copy_key) && row.body.trim()) copy[row.copy_key] = row.body;
  }
  return copy;
}

export async function setNotifyPrefs(
  marathonId: number,
  userId: number,
  prefs: { notifyEmail: boolean; notifyBot: boolean },
  getConnection?: Conn,
): Promise<void> {
  await setNotifyToggles(marathonId, userId, prefs, getConnection);
}

export async function silenceEmail(
  marathonId: number,
  userId: number,
  getConnection?: Conn,
): Promise<boolean> {
  return withConn(async (connection) => {
    const rows = await connection.query<{
      user_id: number;
      notify_bot: number;
      notify_paused: number;
      pref_telegram: number | null;
    }>(
      `SELECT p.user_id, p.notify_bot, p.notify_paused, npref.telegram_on AS pref_telegram
       FROM marathon_participants p
       LEFT JOIN user_channel_preferences npref
         ON npref.user_id = p.user_id AND npref.category = 'marathon'
       WHERE p.marathon_id = ? AND p.user_id = ? LIMIT 1`,
      [marathonId, userId],
    );
    if (!rows[0]) return false;
    const telegram = rows[0].pref_telegram == null
      ? flag(rows[0].notify_bot) && !flag(rows[0].notify_paused)
      : flag(rows[0].pref_telegram);
    await saveUserChannelPreference(connection, userId, "marathon", {
      email: false,
      telegram,
    });
    return true;
  }, getConnection);
}

export async function markConverted(
  marathonId: number,
  userId: number,
  now: Date,
  getConnection?: Conn,
): Promise<void> {
  await withConn(async (connection) => {
    await connection.execute(
      `UPDATE marathon_participants
       SET converted_at = COALESCE(converted_at, ?)
       WHERE marathon_id = ? AND user_id = ?`,
      [now, marathonId, userId],
    );
    await connection.execute(
      `UPDATE app_users
       SET cabinet_scope = 'full'
       WHERE id = ? AND cabinet_scope = 'marathon'`,
      [userId],
    );
  }, getConnection);
}
