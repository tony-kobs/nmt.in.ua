import "server-only";

import type { SqlConnection } from "@/lib/db/mysql";
import {
  defaultChannelPreferences,
  isNotificationCategory,
  type NotificationCategory,
  type UserChannelPreferences,
} from "./channels";
import { ensureChannelPreferencesSchema } from "./channelSchema";

type Conn = () => Promise<SqlConnection>;

async function loadConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

function flag(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

type PrefRow = {
  user_id: number;
  category: string;
  email_on: number;
  telegram_on: number;
};

export async function loadChannelPreferences(
  connection: SqlConnection,
  userIds: number[],
): Promise<Map<number, UserChannelPreferences>> {
  const ids = [...new Set(userIds.filter((id) => Number.isInteger(id) && id > 0))];
  const result = new Map<number, UserChannelPreferences>();
  for (const id of ids) result.set(id, defaultChannelPreferences());
  if (!ids.length) return result;
  const rows = await connection.query<PrefRow>(
    `SELECT user_id, category, email_on, telegram_on
     FROM user_channel_preferences
     WHERE user_id IN (${ids.map(() => "?").join(",")})`,
    ids,
  );
  for (const row of rows) {
    if (!isNotificationCategory(row.category)) continue;
    const prefs = result.get(Number(row.user_id));
    if (!prefs) continue;
    prefs[row.category] = {
      email: flag(row.email_on),
      telegram: flag(row.telegram_on),
    };
  }
  return result;
}

export async function getUserChannelPreferences(
  userId: number,
  getConnection: Conn = loadConnection,
): Promise<UserChannelPreferences> {
  await ensureChannelPreferencesSchema(getConnection);
  const connection = await getConnection();
  try {
    const map = await loadChannelPreferences(connection, [userId]);
    return map.get(userId) ?? defaultChannelPreferences();
  } finally {
    connection.release();
  }
}

export async function saveUserChannelPreference(
  connection: SqlConnection,
  userId: number,
  category: NotificationCategory,
  channels: { email: boolean; telegram: boolean },
): Promise<void> {
  await connection.execute(
    `INSERT INTO user_channel_preferences (user_id, category, email_on, telegram_on)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE email_on = VALUES(email_on), telegram_on = VALUES(telegram_on)`,
    [userId, category, channels.email ? 1 : 0, channels.telegram ? 1 : 0],
  );
}

export async function saveUserChannelPreferences(
  userId: number,
  prefs: UserChannelPreferences,
  getConnection: Conn = loadConnection,
): Promise<void> {
  await ensureChannelPreferencesSchema(getConnection);
  const connection = await getConnection();
  try {
    for (const category of ["marathon", "news", "system"] as const) {
      await saveUserChannelPreference(connection, userId, category, prefs[category]);
    }
  } finally {
    connection.release();
  }
}
