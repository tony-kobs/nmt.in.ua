-- Per-theme task parameters and the values stored on each quiz task.
-- Additive only: new tables, no changes to quiz_tasks or themes rows.
-- A bool is int_value 0 or 1. An int is a whole number >= 0.
-- No row in quiz_task_params means that integer was left empty.
-- Deleting a parameter or a task removes the values (the app deletes
-- them in the same transaction; the foreign keys do the same).
-- Numbers 068–071 stay free for other work. Take a database backup
-- before production. This file does not build levels or generate tasks.

CREATE TABLE IF NOT EXISTS theme_params (
  id INT NOT NULL AUTO_INCREMENT,
  theme_id INT NOT NULL,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  value_type ENUM('bool', 'int') NOT NULL,
  sort INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_theme_params_theme_code (theme_id, code),
  KEY idx_theme_params_theme_sort (theme_id, sort),
  CONSTRAINT fk_theme_params_theme
    FOREIGN KEY (theme_id) REFERENCES themes (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS quiz_task_params (
  task_id INT NOT NULL,
  param_id INT NOT NULL,
  int_value INT NOT NULL,
  PRIMARY KEY (task_id, param_id),
  KEY idx_quiz_task_params_param (param_id),
  CONSTRAINT fk_quiz_task_params_task
    FOREIGN KEY (task_id) REFERENCES quiz_tasks (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_quiz_task_params_param
    FOREIGN KEY (param_id) REFERENCES theme_params (id)
    ON DELETE CASCADE,
  CONSTRAINT chk_quiz_task_params_int_value CHECK (int_value >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
