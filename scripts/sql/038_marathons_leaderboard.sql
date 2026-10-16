-- Marathon shell + participants (daily rules come later). Leaderboard scores are
-- computed from completed task_sessions that started after the student joined
-- and inside the marathon window. The delivery ledger is created by ensureTelegramSchema.

CREATE TABLE IF NOT EXISTS marathons (
  id INT NOT NULL AUTO_INCREMENT,
  slug VARCHAR(64) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  status ENUM('draft', 'active', 'archived') NOT NULL DEFAULT 'draft',
  starts_at INT UNSIGNED NOT NULL,
  ends_at INT UNSIGNED NOT NULL,
  min_tasks_per_session INT UNSIGNED NOT NULL DEFAULT 5,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_marathons_slug (slug),
  KEY idx_marathons_status (status, starts_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS marathon_participants (
  marathon_id INT NOT NULL,
  user_id INT NOT NULL,
  joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (marathon_id, user_id),
  KEY idx_marathon_participants_user (user_id),
  CONSTRAINT fk_marathon_participants_marathon
    FOREIGN KEY (marathon_id) REFERENCES marathons (id) ON DELETE CASCADE,
  CONSTRAINT fk_marathon_participants_user
    FOREIGN KEY (user_id) REFERENCES app_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
