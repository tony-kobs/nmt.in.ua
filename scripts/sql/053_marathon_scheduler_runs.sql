-- History of marathon notification ticks (in-process scheduler and HTTP).
-- Take a database backup before applying this on production.
--
-- One row per finished tick. ran_at is Unix epoch milliseconds.
-- error IS NULL means the planner finished. Rows older than 7 days
-- are deleted by the writer. Health reads the latest successful row.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS. scripts/migrate.mjs skips errno 1050.
-- 050_marathon_cron_heartbeat.sql stays the old single-row pulse.

CREATE TABLE IF NOT EXISTS marathon_scheduler_runs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ran_at BIGINT NOT NULL,
  source VARCHAR(16) NOT NULL,
  processed INT UNSIGNED NOT NULL,
  sent INT UNSIGNED NOT NULL,
  failed INT UNSIGNED NOT NULL,
  duration_ms INT UNSIGNED NOT NULL,
  error VARCHAR(500) NULL,
  PRIMARY KEY (id),
  KEY idx_marathon_scheduler_ran (ran_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
