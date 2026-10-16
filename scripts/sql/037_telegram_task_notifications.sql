-- Delivery journal for Telegram task reminders.
-- Same CREATE as ensureTelegramSchema. Apply after 035 (accounts exist).

CREATE TABLE IF NOT EXISTS telegram_task_notifications (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
