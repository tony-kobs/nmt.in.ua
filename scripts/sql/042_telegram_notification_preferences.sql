-- TG-012/TG-014/TG-015: per-account Telegram notification preferences and daily digest slots.
-- Reference/recovery SQL: ensureTelegramSchema initializes this table automatically after account schema creation.
-- Normal deployment does not require manual execution. For recovery, apply after 035.
-- A missing row uses the defaults below; new-task notifications remain enabled and daily reminders are opt-in.
-- Existing explicit preferences are preserved; changing the column default changes only future inserts.
CREATE TABLE IF NOT EXISTS telegram_notification_preferences (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE telegram_notification_preferences ALTER COLUMN daily_reminder SET DEFAULT 0;
