-- Site feedback (task 6.2). Safe to re-run.
-- mysql ... < scripts/sql/003_site_feedback.sql

CREATE TABLE IF NOT EXISTS site_feedback (
  id INT NOT NULL AUTO_INCREMENT,
  user_id INT NULL,
  session_id INT NULL,
  score TINYINT NOT NULL,
  message TEXT NULL,
  email VARCHAR(255) NULL,
  source ENUM('footer', 'post_test') NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_site_feedback_created (created_at),
  KEY idx_site_feedback_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
