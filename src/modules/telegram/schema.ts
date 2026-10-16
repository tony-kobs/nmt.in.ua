import "server-only";

import type { SqlConnection } from "@/lib/db/mysql";
import { ensureAuthSchema } from "@/modules/auth/users";

export async function loadTelegramConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

let schemaReady: Promise<void> | undefined;

export async function ensureTelegramSchema(
  getConnection: () => Promise<SqlConnection> = loadTelegramConnection,
): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await ensureAuthSchema({ getConnection });
      const connection = await getConnection();
      try {
        await connection.execute(`CREATE TABLE IF NOT EXISTS user_telegram_accounts (
          id BIGINT NOT NULL AUTO_INCREMENT,
          user_id INT NOT NULL,
          telegram_user_id BIGINT NOT NULL,
          telegram_chat_id BIGINT NOT NULL,
          telegram_username VARCHAR(32) NULL,
          linked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uq_telegram_user (user_id),
          UNIQUE KEY uq_telegram_identity (telegram_user_id),
          CONSTRAINT fk_telegram_account_user FOREIGN KEY (user_id) REFERENCES app_users (id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`, []);
        await connection.execute(`CREATE TABLE IF NOT EXISTS telegram_notification_preferences (
          account_id BIGINT NOT NULL,
          new_tasks TINYINT(1) NOT NULL DEFAULT 1,
          deadline_reminders TINYINT(1) NOT NULL DEFAULT 1,
          daily_reminder TINYINT(1) NOT NULL DEFAULT 0,
          teacher_results TINYINT(1) NOT NULL DEFAULT 1,
          teacher_daily TINYINT(1) NOT NULL DEFAULT 0,
          quiet_start TINYINT UNSIGNED NULL DEFAULT NULL,
          quiet_end TINYINT UNSIGNED NULL DEFAULT NULL,
          teacher_baseline_at TIMESTAMP NULL DEFAULT NULL,
          student_digest_on DATE NULL DEFAULT NULL,
          teacher_digest_on DATE NULL DEFAULT NULL,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          PRIMARY KEY (account_id),
          CONSTRAINT fk_telegram_preferences_account FOREIGN KEY (account_id)
            REFERENCES user_telegram_accounts (id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`, []);
        await connection.execute("ALTER TABLE telegram_notification_preferences ALTER COLUMN daily_reminder SET DEFAULT 0", []);
        await connection.execute(`CREATE TABLE IF NOT EXISTS telegram_link_tokens (
          id BIGINT NOT NULL AUTO_INCREMENT,
          user_id INT NOT NULL,
          token_hash CHAR(64) NOT NULL,
          expires_at TIMESTAMP NOT NULL,
          consumed_at TIMESTAMP NULL DEFAULT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
          PRIMARY KEY (id),
          UNIQUE KEY uq_telegram_token_hash (token_hash),
          KEY idx_telegram_token_user (user_id, created_at),
          CONSTRAINT fk_telegram_token_user FOREIGN KEY (user_id) REFERENCES app_users (id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`, []);
        await connection.execute(`CREATE TABLE IF NOT EXISTS telegram_task_notifications (
          account_id BIGINT NOT NULL,
          session_id INT NOT NULL,
          notification_type VARCHAR(32) NOT NULL,
          delivery_state ENUM('ready', 'sending', 'delivered') NOT NULL DEFAULT 'ready',
          attempted_at TIMESTAMP NULL DEFAULT NULL,
          delivered_at TIMESTAMP NULL DEFAULT NULL,
          telegram_message_id BIGINT NULL,
          PRIMARY KEY (account_id, session_id, notification_type),
          CONSTRAINT fk_telegram_notification_account FOREIGN KEY (account_id)
            REFERENCES user_telegram_accounts (id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`, []);
      } finally {
        connection.release();
      }
    })().catch((error) => {
      schemaReady = undefined;
      throw error;
    });
  }
  await schemaReady;
}
