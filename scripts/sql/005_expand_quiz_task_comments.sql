-- Allow longer solution comments for quiz tasks.

ALTER TABLE quiz_tasks
  MODIFY COLUMN comments TEXT NOT NULL;