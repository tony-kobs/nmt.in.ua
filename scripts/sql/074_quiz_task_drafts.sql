-- Drafts of generated quiz tasks stay out of student pools.
-- Additive: status and the id of the task a draft was generated from.
-- Existing rows become published (the column default).
-- Deleting the source task clears the link and keeps the draft.
-- Numbers 068–071 stay free. Take a database backup before production.

ALTER TABLE quiz_tasks
  ADD COLUMN status ENUM('draft', 'published') NOT NULL DEFAULT 'published';

ALTER TABLE quiz_tasks
  ADD COLUMN source_task_id INT NULL DEFAULT NULL;

ALTER TABLE quiz_tasks
  ADD KEY idx_quiz_tasks_theme_status (theme_id, status);

ALTER TABLE quiz_tasks
  ADD KEY idx_quiz_tasks_source (source_task_id);

ALTER TABLE quiz_tasks
  ADD CONSTRAINT fk_quiz_tasks_source
    FOREIGN KEY (source_task_id) REFERENCES quiz_tasks (id)
    ON DELETE SET NULL;
