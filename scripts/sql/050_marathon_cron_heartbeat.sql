-- Last successful marathon notification cron run.
-- Take a database backup before applying this on production.
--
-- One row (id = 1). Each POST /api/marathon/notifications/process that
-- finishes writes the time and the planner counts. GET .../health reads it.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS. scripts/migrate.mjs skips errno 1050.

CREATE TABLE IF NOT EXISTS marathon_cron_heartbeat (
  id TINYINT UNSIGNED NOT NULL,
  ran_at_ms BIGINT NOT NULL,
  processed INT UNSIGNED NOT NULL,
  sent INT UNSIGNED NOT NULL,
  failed INT UNSIGNED NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
