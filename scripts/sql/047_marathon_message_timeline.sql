-- Marathon message timeline: per-slot overrides and deferred one-off jobs.
-- Take a database backup before applying this file on production.
--
-- Overrides postpone, replace the text of, or cancel one planned send
-- (day + kind + channel). Already delivered rows stay in marathon_notifications.
-- Jobs hold a rank notice (or similar) that should leave later than the submit.
-- marathon_telegram_outbox.marathon_id ties queued Telegram to the admin timeline.
-- outcome marks a claim that was closed without a send.
-- error_text keeps a short reason (Telegram 403, Brevo, timeout, skip).
-- hold_reason is 'quiet' for system quiet hours or 'postpone' for an admin time.
--
-- Idempotent: CREATE IF NOT EXISTS, ADD COLUMN (errno 1060), MODIFY enum.
-- scripts/migrate.mjs skips errno 1050, 1060 and 1061.

CREATE TABLE IF NOT EXISTS marathon_message_overrides (
  marathon_id INT NOT NULL,
  day_number TINYINT UNSIGNED NOT NULL,
  kind VARCHAR(32) NOT NULL,
  channel VARCHAR(16) NOT NULL,
  cancelled TINYINT(1) NOT NULL DEFAULT 0,
  send_at DATETIME NULL,
  body TEXT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (marathon_id, day_number, kind, channel),
  CONSTRAINT fk_marathon_message_override FOREIGN KEY (marathon_id)
    REFERENCES marathons (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS marathon_message_jobs (
  id BIGINT NOT NULL AUTO_INCREMENT,
  marathon_id INT NOT NULL,
  user_id INT NOT NULL,
  day_number TINYINT UNSIGNED NOT NULL,
  kind VARCHAR(32) NOT NULL,
  channel VARCHAR(16) NOT NULL,
  body TEXT NOT NULL,
  send_at DATETIME NOT NULL,
  status ENUM('queued','sending','sent','failed','cancelled') NOT NULL DEFAULT 'queued',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_marathon_message_job_due (status, send_at),
  KEY idx_marathon_message_job_slot (marathon_id, day_number, kind, channel),
  CONSTRAINT fk_marathon_message_job FOREIGN KEY (marathon_id)
    REFERENCES marathons (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE marathon_notifications
  ADD COLUMN outcome VARCHAR(16) NULL AFTER delivered;

-- Rank notices share the same ledger as day opens. Idempotent MODIFY.
ALTER TABLE marathon_notifications
  MODIFY COLUMN kind ENUM(
    'day_open', 'reminder', 'tomorrow', 'final', 'nudge', 'registered', 'rank'
  ) NOT NULL;

ALTER TABLE marathon_telegram_outbox
  ADD COLUMN marathon_id INT NULL AFTER chat_id;

ALTER TABLE marathon_telegram_outbox
  MODIFY COLUMN status ENUM('pending','sent','failed','cancelled') NOT NULL DEFAULT 'pending';

ALTER TABLE marathon_notifications
  ADD COLUMN error_text VARCHAR(500) NULL AFTER outcome;

ALTER TABLE marathon_telegram_outbox
  ADD COLUMN error_text VARCHAR(500) NULL AFTER attempts;

ALTER TABLE marathon_telegram_outbox
  ADD COLUMN hold_reason VARCHAR(16) NULL AFTER error_text;

ALTER TABLE marathon_message_jobs
  ADD COLUMN error_text VARCHAR(500) NULL AFTER status;

ALTER TABLE marathon_message_jobs
  ADD COLUMN hold_reason VARCHAR(16) NULL AFTER error_text;
