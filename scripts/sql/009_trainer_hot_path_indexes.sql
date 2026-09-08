-- Indexes for the queries a student hits while taking a test.
--
-- PRE-FLIGHT: these legacy tables have no committed DDL in this repo. Run
-- `SHOW CREATE TABLE tasks2session;`, `SHOW CREATE TABLE task_sessions;` and
-- `SHOW CREATE TABLE quiz_tasks;` first — if an equivalent index already
-- exists (any index whose leftmost column matches), skip that statement.
-- MySQL has no `ADD INDEX IF NOT EXISTS`, so a duplicate name errors out and
-- a duplicate index just wastes writes.
--
-- Why each one:
--   - tasks2session(session_id): getSessionTasks loads every task of a
--     session; finishTrainerSession re-reads their statuses. Without it each
--     question screen scans the whole mapping table.
--   - tasks2session(user_id, session_id): checkAnswer / skipTaskAnswer look up
--     one mapping row `FOR UPDATE` on every answered question.
--   - task_sessions(user_id, session_status): the sessions list and the
--     "already in progress" guard filter by owner.
--   - quiz_tasks(theme_id): starting a test runs
--     `WHERE theme_id = ? ORDER BY RAND() LIMIT n` — a full scan otherwise.
-- Run once in phpMyAdmin or: mysql ... < scripts/sql/009_trainer_hot_path_indexes.sql
-- Застосовано на levelhst_maththemes 08.09.2026 (~45 мс на кожен ALTER).

ALTER TABLE tasks2session
  ADD KEY idx_tasks2session_session (session_id),
  ADD KEY idx_tasks2session_user_session (user_id, session_id);

ALTER TABLE task_sessions
  ADD KEY idx_task_sessions_user_status (user_id, session_status);

ALTER TABLE quiz_tasks
  ADD KEY idx_quiz_tasks_theme (theme_id);
