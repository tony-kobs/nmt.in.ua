-- Login / entry-point rows. Online is a non-revoked, unexpired row
-- whose last_seen_at is inside 5 minutes. `ip` stays NULL on old rows.
-- Applied lazily by ensureUserSessionsSchema; safe to re-run.

CREATE TABLE IF NOT EXISTS user_sessions (
  id BIGINT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP NULL DEFAULT NULL,
  last_seen_at TIMESTAMP NULL DEFAULT NULL,
  ip VARCHAR(45) NULL DEFAULT NULL,
  user_agent VARCHAR(255) NULL DEFAULT NULL,
  PRIMARY KEY (id),
  KEY idx_user_sessions_user (user_id, id),
  KEY idx_user_sessions_presence (user_id, revoked_at, expires_at, last_seen_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
