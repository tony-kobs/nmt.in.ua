-- Scheduled account deletion. Take a database backup before applying this on production.
--
-- A normal account is not removed when an admin presses delete. The row keeps
-- when the request was made, when it becomes due (14 days later), which admin
-- asked, and the hash of the one-time «keep this account» link.
-- deletion_reminder_sent_at stops the 3-day reminder from going out on every cron tick.
-- A banned account is deleted immediately and these columns stay empty.
--
-- Idempotent: each ADD COLUMN is its own statement. scripts/migrate.mjs skips errno 1060.

ALTER TABLE app_users
  ADD COLUMN deletion_requested_at TIMESTAMP NULL DEFAULT NULL AFTER created_at;

ALTER TABLE app_users
  ADD COLUMN deletion_due_at TIMESTAMP NULL DEFAULT NULL AFTER deletion_requested_at;

ALTER TABLE app_users
  ADD COLUMN deletion_requested_by INT NULL DEFAULT NULL AFTER deletion_due_at;

ALTER TABLE app_users
  ADD COLUMN deletion_cancel_token_hash CHAR(64) NULL DEFAULT NULL AFTER deletion_requested_by;

ALTER TABLE app_users
  ADD COLUMN deletion_reminder_sent_at TIMESTAMP NULL DEFAULT NULL AFTER deletion_cancel_token_hash;
