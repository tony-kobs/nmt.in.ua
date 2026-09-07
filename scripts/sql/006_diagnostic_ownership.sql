-- Guest ownership for the public diagnostic test (feat/diagnostic-self-score).
--
-- PRE-FLIGHT: run `SHOW CREATE TABLE task_sessions;` and
-- `SHOW CREATE TABLE tasks2session;` against the real DB first and adjust the
-- MODIFY COLUMN lines below if the existing type/attributes differ — this
-- repo has no committed DDL for these two legacy tables to diff against.
--
-- What this does:
--   - Lets a diagnostic attempt belong to a guest (no app_users row) instead
--     of an authenticated user: user_id becomes nullable, and a new
--     guest_token column identifies the anonymous owner instead.
--   - Lets a diagnostic task_sessions row span multiple themes (3 tasks per
--     eligible theme, up to 10 themes) by making theme_id nullable — a
--     diagnostic attempt does not belong to exactly one theme.
--   - Existing rows (session_type 1-4) are unaffected: they always populate
--     user_id and theme_id, never guest_token.
-- Run once in phpMyAdmin or: mysql ... < scripts/sql/006_diagnostic_ownership.sql

ALTER TABLE task_sessions
  MODIFY COLUMN user_id INT NULL,
  MODIFY COLUMN theme_id INT NULL,
  ADD COLUMN guest_token CHAR(36) NULL AFTER user_id,
  ADD KEY idx_task_sessions_guest_token (guest_token);

ALTER TABLE tasks2session
  MODIFY COLUMN user_id INT NULL,
  ADD COLUMN guest_token CHAR(36) NULL AFTER user_id,
  ADD KEY idx_tasks2session_guest_token (guest_token);
