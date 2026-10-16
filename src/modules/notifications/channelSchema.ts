import type { SqlConnection } from "@/lib/db/mysql";
import { ensureSchemaOnce, resetSchemaGuardForTests } from "@/lib/db/schemaGuard";
import { ensureAuthSchema } from "@/modules/auth/users";
import { mysqlErrno } from "@/modules/teacher-students/mysqlErrno";

const SQL_CREATE = `
  CREATE TABLE IF NOT EXISTS user_channel_preferences (
    user_id INT NOT NULL,
    category VARCHAR(16) NOT NULL,
    email_on TINYINT(1) NOT NULL,
    telegram_on TINYINT(1) NOT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, category),
    CONSTRAINT fk_user_channel_pref_user FOREIGN KEY (user_id)
      REFERENCES app_users (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

/**
 * Copy the old per-marathon columns once. INSERT IGNORE leaves a later edit in place.
 * Paused rows become both channels off. Any live flag turns that channel on.
 */
const SQL_BACKFILL = `
  INSERT IGNORE INTO user_channel_preferences (user_id, category, email_on, telegram_on)
  SELECT p.user_id, 'marathon',
    MAX(CASE WHEN p.notify_paused = 0 AND p.notify_email <> 0 THEN 1 ELSE 0 END),
    MAX(CASE WHEN p.notify_paused = 0 AND p.notify_bot <> 0 THEN 1 ELSE 0 END)
  FROM marathon_participants p
  GROUP BY p.user_id
`;

async function loadConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

/** DDL plus the one-time marathon-column copy. Caller owns the connection. */
export async function applyChannelPreferencesSchema(connection: SqlConnection): Promise<void> {
  await connection.execute(SQL_CREATE, []);
  try {
    await connection.execute(SQL_BACKFILL, []);
  } catch (error) {
    const errno = mysqlErrno(error);
    if (errno !== 1146 && errno !== 1054) throw error;
  }
}

export async function ensureChannelPreferencesSchema(
  getConnection: () => Promise<SqlConnection> = loadConnection,
): Promise<void> {
  await ensureSchemaOnce(
    "channel_preferences",
    ["044_notification_channels_and_invites.sql"],
    getConnection,
    async (connection) => {
      await ensureAuthSchema({ getConnection });
      await applyChannelPreferencesSchema(connection);
    },
  );
}

export function resetChannelPreferencesSchemaForTests(): void {
  resetSchemaGuardForTests("channel_preferences");
}
