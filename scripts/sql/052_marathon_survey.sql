-- Take a database backup before applying this on production.
-- 050 is reserved by the unmerged cron-heartbeat migration.
-- 051 is reserved by the unmerged support-tickets migration.

CREATE TABLE IF NOT EXISTS marathon_surveys (
  marathon_id INT NOT NULL,
  user_id INT NOT NULL,
  rating TINYINT UNSIGNED NULL,
  improve_text VARCHAR(2000) NULL,
  recommend TINYINT(1) NULL,
  status ENUM('active', 'done', 'skipped') NOT NULL DEFAULT 'active',
  step ENUM('rating', 'improve', 'recommend') NOT NULL DEFAULT 'rating',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (marathon_id, user_id),
  CONSTRAINT fk_marathon_surveys_marathon FOREIGN KEY (marathon_id) REFERENCES marathons (id) ON DELETE CASCADE,
  CONSTRAINT fk_marathon_surveys_user FOREIGN KEY (user_id) REFERENCES app_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
