-- Dedicated NMT exam task bank (mentor task 6.8).
-- Separate from quiz_tasks so topic-test / Ultimate / diagnostic never
-- draw official variant items via ORDER BY RAND().
--
-- nmt_variant_tasks.task_id references nmt_quiz_tasks.id (not quiz_tasks).
-- tasks2session rows for simulator sessions use task_type = 4 and the same
-- nmt_quiz_tasks.id in task_id.
--
-- task_kind:
--   mcq   — five options А–Д (right_answer_n 1..5)
--   match — three stems × letters (right_answer_text e.g. "1b;2c;3a")
--   open  — short numeric (right_answer_text)
--
-- Run after 011_nmt_variants.sql:
--   mysql ... < scripts/sql/012_nmt_quiz_tasks.sql

CREATE TABLE IF NOT EXISTS nmt_quiz_tasks (
  id INT NOT NULL AUTO_INCREMENT,
  name VARCHAR(100) NOT NULL,
  task_text TEXT NOT NULL,
  answer_1 VARCHAR(255) NULL,
  answer_2 VARCHAR(255) NULL,
  answer_3 VARCHAR(255) NULL,
  answer_4 VARCHAR(255) NULL,
  answer_5 VARCHAR(255) NULL,
  right_answer_n TINYINT NULL,
  right_answer_text VARCHAR(64) NULL,
  task_kind ENUM('mcq', 'match', 'open') NOT NULL DEFAULT 'mcq',
  comments TEXT NOT NULL,
  difficulty TINYINT NOT NULL DEFAULT 1,
  source_url VARCHAR(255) NULL,
  PRIMARY KEY (id),
  KEY idx_nmt_quiz_tasks_kind (task_kind)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
