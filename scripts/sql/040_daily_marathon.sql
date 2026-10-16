-- Daily marathon shape from src/modules/marathons/dailySchema.ts.
-- Builds on 038_marathons_leaderboard. `npm run migrate` ignores errno 1060/1061
-- so this file is safe on a database where ensureMarathonSchema already added
-- the columns and tables.

ALTER TABLE marathons
  ADD COLUMN kind ENUM('leaderboard', 'daily') NOT NULL DEFAULT 'leaderboard' AFTER status;

ALTER TABLE marathons
  ADD COLUMN description TEXT NULL AFTER title;

ALTER TABLE marathons
  ADD COLUMN subject VARCHAR(64) NOT NULL DEFAULT 'math' AFTER description;

ALTER TABLE marathons
  ADD COLUMN start_date CHAR(10) NULL AFTER subject;

ALTER TABLE marathons
  ADD COLUMN unlock_hour CHAR(5) NOT NULL DEFAULT '09:00' AFTER start_date;

ALTER TABLE marathons
  ADD COLUMN reminder_hour CHAR(5) NOT NULL DEFAULT '19:00' AFTER unlock_hour;

ALTER TABLE marathons
  ADD COLUMN nudge_from TINYINT UNSIGNED NOT NULL DEFAULT 10 AFTER reminder_hour;

ALTER TABLE marathons
  ADD COLUMN nudge_until TINYINT UNSIGNED NOT NULL DEFAULT 21 AFTER nudge_from;

ALTER TABLE marathons
  ADD COLUMN days_count TINYINT UNSIGNED NOT NULL DEFAULT 5 AFTER nudge_until;

ALTER TABLE marathons
  ADD COLUMN pass_threshold TINYINT UNSIGNED NOT NULL DEFAULT 60 AFTER days_count;

ALTER TABLE marathons
  ADD COLUMN final_cta_text VARCHAR(500) NULL AFTER pass_threshold;

ALTER TABLE marathons
  ADD COLUMN final_cta_url VARCHAR(500) NULL AFTER final_cta_text;

ALTER TABLE marathons
  ADD COLUMN intro_video_url VARCHAR(500) NULL AFTER final_cta_url;

ALTER TABLE marathons
  ADD COLUMN invite_audience ENUM('none', 'students', 'all') NOT NULL DEFAULT 'none' AFTER intro_video_url;

ALTER TABLE marathons
  MODIFY COLUMN status ENUM('draft', 'active', 'archived', 'finished')
  NOT NULL DEFAULT 'draft';

ALTER TABLE marathon_participants
  ADD COLUMN source VARCHAR(512) NULL AFTER joined_at;

ALTER TABLE marathon_participants
  ADD COLUMN streak SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER source;

ALTER TABLE marathon_participants
  ADD COLUMN finished_at TIMESTAMP NULL DEFAULT NULL AFTER streak;

ALTER TABLE marathon_participants
  ADD COLUMN converted_at TIMESTAMP NULL DEFAULT NULL AFTER finished_at;

ALTER TABLE marathon_participants
  ADD COLUMN telegram_chat_id BIGINT NULL AFTER converted_at;

ALTER TABLE marathon_participants
  ADD COLUMN notify_email TINYINT(1) NOT NULL DEFAULT 1 AFTER telegram_chat_id;

ALTER TABLE marathon_participants
  ADD COLUMN notify_bot TINYINT(1) NOT NULL DEFAULT 0 AFTER notify_email;

ALTER TABLE marathon_participants
  ADD COLUMN delivery_channel ENUM('site', 'telegram') NULL AFTER notify_bot;

ALTER TABLE marathon_participants
  ADD COLUMN intro_seen_at TIMESTAMP NULL DEFAULT NULL AFTER delivery_channel;

ALTER TABLE marathon_participants
  ADD COLUMN notify_paused TINYINT(1) NOT NULL DEFAULT 0 AFTER intro_seen_at;

ALTER TABLE marathon_participants
  ADD COLUMN telegram_selected_at TIMESTAMP NULL AFTER notify_paused;

CREATE TABLE IF NOT EXISTS marathon_riddles (
  id INT NOT NULL AUTO_INCREMENT,
  marathon_id INT NOT NULL,
  sort_order INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT NOT NULL,
  answer VARCHAR(512) NOT NULL,
  hint TEXT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_marathon_riddle_order (marathon_id, sort_order),
  KEY idx_marathon_riddle (marathon_id),
  CONSTRAINT fk_marathon_riddle FOREIGN KEY (marathon_id) REFERENCES marathons (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS marathon_days (
  id INT NOT NULL AUTO_INCREMENT,
  marathon_id INT NOT NULL,
  day_number TINYINT UNSIGNED NOT NULL,
  topic VARCHAR(255) NOT NULL,
  intro_text TEXT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_marathon_day_number (marathon_id, day_number),
  CONSTRAINT fk_marathon_day FOREIGN KEY (marathon_id) REFERENCES marathons (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS marathon_day_materials (
  id INT NOT NULL AUTO_INCREMENT,
  day_id INT NOT NULL,
  sort_order INT NOT NULL,
  material_type ENUM('loom', 'youtube', 'text') NOT NULL,
  url_or_body MEDIUMTEXT NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_marathon_material_order (day_id, sort_order),
  CONSTRAINT fk_marathon_material_day FOREIGN KEY (day_id) REFERENCES marathon_days (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS marathon_day_tasks (
  id INT NOT NULL AUTO_INCREMENT,
  day_id INT NOT NULL,
  sort_order INT NOT NULL,
  question_id INT NULL,
  inline_prompt TEXT NULL,
  inline_options TEXT NULL,
  inline_correct TINYINT NULL,
  inline_explanation TEXT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_marathon_task_order (day_id, sort_order),
  KEY idx_marathon_task_question (question_id),
  CONSTRAINT fk_marathon_task_day FOREIGN KEY (day_id) REFERENCES marathon_days (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE marathon_day_tasks
  ADD COLUMN inline_explanation TEXT NULL AFTER inline_correct;

CREATE TABLE IF NOT EXISTS marathon_day_progress (
  marathon_id INT NOT NULL,
  user_id INT NOT NULL,
  day_id INT NOT NULL,
  materials_viewed_at TIMESTAMP NULL DEFAULT NULL,
  score TINYINT UNSIGNED NULL,
  correct_count SMALLINT UNSIGNED NULL,
  passed TINYINT(1) NOT NULL DEFAULT 0,
  completed_at TIMESTAMP NULL DEFAULT NULL,
  answers_json TEXT NULL,
  PRIMARY KEY (marathon_id, user_id, day_id),
  CONSTRAINT fk_marathon_progress_participant FOREIGN KEY (marathon_id, user_id)
    REFERENCES marathon_participants (marathon_id, user_id) ON DELETE CASCADE,
  CONSTRAINT fk_marathon_progress_day FOREIGN KEY (day_id)
    REFERENCES marathon_days (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE marathon_day_progress
  ADD COLUMN answers_json TEXT NULL AFTER completed_at;

ALTER TABLE marathon_day_progress
  ADD COLUMN correct_count SMALLINT UNSIGNED NULL AFTER score;

CREATE TABLE IF NOT EXISTS marathon_notifications (
  marathon_id INT NOT NULL,
  user_id INT NOT NULL,
  day_number TINYINT UNSIGNED NOT NULL,
  kind ENUM('day_open', 'reminder', 'tomorrow', 'final', 'nudge', 'registered') NOT NULL,
  channel ENUM('email', 'telegram') NOT NULL,
  sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  delivered TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (marathon_id, user_id, day_number, kind, channel)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE marathon_notifications
  ADD COLUMN delivered TINYINT(1) NOT NULL DEFAULT 1 AFTER sent_at;

ALTER TABLE marathon_notifications
  MODIFY COLUMN kind ENUM('day_open', 'reminder', 'tomorrow', 'final', 'nudge', 'registered') NOT NULL;

CREATE TABLE IF NOT EXISTS marathon_ranks (
  marathon_id INT NOT NULL,
  user_id INT NOT NULL,
  place SMALLINT UNSIGNED NOT NULL,
  prev_place SMALLINT UNSIGNED NULL,
  points INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (marathon_id, user_id),
  CONSTRAINT fk_marathon_ranks_participant FOREIGN KEY (marathon_id, user_id)
    REFERENCES marathon_participants (marathon_id, user_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS marathon_copy (
  marathon_id INT NOT NULL,
  copy_key VARCHAR(64) NOT NULL,
  body TEXT NOT NULL,
  PRIMARY KEY (marathon_id, copy_key),
  CONSTRAINT fk_marathon_copy FOREIGN KEY (marathon_id) REFERENCES marathons (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS marathon_bot_tokens (
  token VARCHAR(40) NOT NULL,
  marathon_id INT NOT NULL,
  user_id INT NOT NULL,
  payload VARCHAR(240) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (token),
  KEY idx_marathon_bot_tokens_user (marathon_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS marathon_telegram_outbox (
  id BIGINT NOT NULL AUTO_INCREMENT,
  chat_id VARCHAR(32) NOT NULL,
  payload MEDIUMTEXT NOT NULL,
  status ENUM('pending', 'sent', 'failed') NOT NULL DEFAULT 'pending',
  not_before TIMESTAMP NULL DEFAULT NULL,
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_marathon_tg_outbox (status, not_before, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS marathon_declines (
  marathon_id INT NOT NULL,
  user_id INT NOT NULL,
  declined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (marathon_id, user_id),
  CONSTRAINT fk_marathon_decline_marathon FOREIGN KEY (marathon_id)
    REFERENCES marathons (id) ON DELETE CASCADE,
  CONSTRAINT fk_marathon_decline_user FOREIGN KEY (user_id)
    REFERENCES app_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS marathon_bot_links (
  id INT NOT NULL AUTO_INCREMENT,
  marathon_id INT NOT NULL,
  user_id INT NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  consumed_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_marathon_bot_token (token_hash),
  KEY idx_marathon_bot_user (marathon_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS marathon_schema_flags (
  name VARCHAR(64) NOT NULL,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

UPDATE marathons
SET description = ''
WHERE kind = 'daily'
  AND (description IS NULL OR description = subject)
  AND NOT EXISTS (
    SELECT 1 FROM marathon_schema_flags f WHERE f.name = 'daily_description_split'
  );

INSERT IGNORE INTO marathon_schema_flags (name) VALUES ('daily_description_split');
