-- TG-012/TG-014/TG-015: per-account Telegram notification preferences and daily digest slots.
-- Additive: a missing row means the defaults below, so accounts linked before this migration keep
-- receiving new-task notifications exactly as with 037. Apply after 035 and 037.
CREATE TABLE IF NOT EXISTS telegram_notification_preferences (
  account_id BIGINT NOT NULL,
  new_tasks TINYINT(1) NOT NULL DEFAULT 1,
  deadline_reminders TINYINT(1) NOT NULL DEFAULT 1,
  daily_reminder TINYINT(1) NOT NULL DEFAULT 1,
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
