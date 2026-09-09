-- Official NMT exam variants (mentor task 6.8).
--
-- Replaces `ORDER BY RAND() LIMIT 22` over the whole quiz_tasks bank with
-- fixed variants (year + label). Tasks stay in quiz_tasks; membership and
-- order live here. Topic-test / Ultimate / diagnostic must not draw these
-- rows — filter with:
--   NOT EXISTS (
--     SELECT 1 FROM nmt_variant_tasks nvt WHERE nvt.task_id = quiz_tasks.id
--   )
-- or put official tasks under a service theme excluded from topic pickers.
--
-- PRE-FLIGHT: `SHOW COLUMNS FROM task_sessions LIKE 'nmt_variant_id';`
-- Skip the ALTER if the column already exists (MySQL has no IF NOT EXISTS
-- for ADD COLUMN on older hosts).
--
-- Run once: mysql ... < scripts/sql/011_nmt_variants.sql

CREATE TABLE IF NOT EXISTS nmt_variants (
  id INT NOT NULL AUTO_INCREMENT,
  year SMALLINT NOT NULL,
  label VARCHAR(120) NOT NULL,
  source_note VARCHAR(255) NULL,
  tasks_number TINYINT NOT NULL DEFAULT 22,
  is_published TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_nmt_variants_year (year, is_published)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS nmt_variant_tasks (
  variant_id INT NOT NULL,
  task_id INT NOT NULL,
  ord SMALLINT NOT NULL,
  PRIMARY KEY (variant_id, task_id),
  UNIQUE KEY uq_nmt_variant_tasks_ord (variant_id, ord),
  KEY idx_nmt_variant_tasks_task (task_id),
  CONSTRAINT fk_nmt_variant_tasks_variant
    FOREIGN KEY (variant_id) REFERENCES nmt_variants (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Links a finished / in-progress simulator session (session_type = 4) to the
-- variant the student chose (or that was picked at random).
ALTER TABLE task_sessions
  ADD COLUMN nmt_variant_id INT NULL AFTER theme_id,
  ADD KEY idx_task_sessions_nmt_variant (user_id, nmt_variant_id, session_status);
