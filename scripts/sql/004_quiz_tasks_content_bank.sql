-- Expand quiz answer fields and add difficulty level for the content bank.

ALTER TABLE quiz_tasks
  MODIFY COLUMN answer_1 VARCHAR(255) NOT NULL,
  MODIFY COLUMN answer_2 VARCHAR(255) NOT NULL,
  MODIFY COLUMN answer_3 VARCHAR(255) NOT NULL,
  MODIFY COLUMN answer_4 VARCHAR(255) NOT NULL,
  ADD COLUMN difficulty TINYINT NOT NULL DEFAULT 1;
