-- Take a database backup before applying this on production.
-- Day timing: first open of the tasks, submit, and the stored duration.
-- Existing rows stay NULL. Ranking treats that as an unknown time.

ALTER TABLE marathon_day_progress
  ADD COLUMN started_at TIMESTAMP NULL DEFAULT NULL AFTER materials_viewed_at;

ALTER TABLE marathon_day_progress
  ADD COLUMN submitted_at TIMESTAMP NULL DEFAULT NULL AFTER completed_at;

ALTER TABLE marathon_day_progress
  ADD COLUMN duration_seconds INT UNSIGNED NULL DEFAULT NULL AFTER submitted_at;
