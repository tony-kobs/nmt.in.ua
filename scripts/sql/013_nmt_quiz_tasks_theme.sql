-- Link official NMT tasks to cabinet themes for post-simulator review.
-- theme_id is nullable: unmatched comments stay NULL until curated.
--
-- Run after 012_nmt_quiz_tasks.sql:
--   mysql ... < scripts/sql/013_nmt_quiz_tasks_theme.sql
-- Then: node scripts/map-nmt-task-themes.mjs

ALTER TABLE nmt_quiz_tasks
  ADD COLUMN theme_id INT NULL AFTER id,
  ADD KEY idx_nmt_quiz_tasks_theme (theme_id);
