-- Take a database backup before applying this on production.
-- 050 is reserved by the unmerged cron-heartbeat migration. This file is 051.

ALTER TABLE marathons
  ADD COLUMN public_chat_url VARCHAR(500) NULL AFTER landing_riddle_count;

-- Launch course. A value the admin already saved is left alone.
UPDATE marathons
SET public_chat_url = 'https://t.me/nmt_onemath'
WHERE slug = 'onemath'
  AND (public_chat_url IS NULL OR public_chat_url = '');

CREATE TABLE IF NOT EXISTS support_tickets (
  id BIGINT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  telegram_chat_id VARCHAR(32) NOT NULL,
  marathon_id INT NULL,
  day_number TINYINT UNSIGNED NULL,
  body VARCHAR(4000) NOT NULL,
  status ENUM('new', 'in_progress', 'closed') NOT NULL DEFAULT 'new',
  reply_text VARCHAR(4000) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_support_tickets_status (status, id),
  CONSTRAINT fk_support_tickets_user FOREIGN KEY (user_id) REFERENCES app_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS support_waits (
  chat_id VARCHAR(32) NOT NULL,
  user_id INT NOT NULL,
  marathon_id INT NULL,
  day_number TINYINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (chat_id),
  CONSTRAINT fk_support_waits_user FOREIGN KEY (user_id) REFERENCES app_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row: the chat id Telegram returned in migrate_to_chat_id. The env value is not stored here.
CREATE TABLE IF NOT EXISTS support_forward_state (
  id TINYINT UNSIGNED NOT NULL,
  migrated_chat_id VARCHAR(32) NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
