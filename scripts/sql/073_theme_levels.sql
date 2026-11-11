-- Levels of one theme, defined as rules over that theme's parameters.
-- Additive only: new tables, plus a nullable level_id on mentor_assignments.
-- quiz_tasks and themes rows are not rewritten.
--
-- A bool rule stores 0 or 1 in bool_value. An int rule stores an inclusive
-- min and max. A task with no quiz_task_params row for a rule's parameter
-- does not match that level.
-- Deleting a parameter removes its rules (the foreign key). Deleting a
-- level sets mentor_assignments.level_id to NULL; tasks already frozen in
-- a teacher session stay as they were.
-- Numbers 068–071 stay free. Take a database backup before production.

CREATE TABLE IF NOT EXISTS theme_levels (
  id INT NOT NULL AUTO_INCREMENT,
  theme_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  sort INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_theme_levels_theme_sort (theme_id, sort),
  CONSTRAINT fk_theme_levels_theme
    FOREIGN KEY (theme_id) REFERENCES themes (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS theme_level_rules (
  id INT NOT NULL AUTO_INCREMENT,
  level_id INT NOT NULL,
  param_id INT NOT NULL,
  bool_value TINYINT NULL,
  int_min INT NULL,
  int_max INT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_theme_level_rules_level_param (level_id, param_id),
  KEY idx_theme_level_rules_param (param_id),
  CONSTRAINT fk_theme_level_rules_level
    FOREIGN KEY (level_id) REFERENCES theme_levels (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_theme_level_rules_param
    FOREIGN KEY (param_id) REFERENCES theme_params (id)
    ON DELETE CASCADE,
  CONSTRAINT chk_theme_level_rules_bool
    CHECK (bool_value IS NULL OR bool_value IN (0, 1)),
  CONSTRAINT chk_theme_level_rules_int_min
    CHECK (int_min IS NULL OR int_min >= 0),
  CONSTRAINT chk_theme_level_rules_int_max
    CHECK (int_max IS NULL OR int_max >= 0),
  CONSTRAINT chk_theme_level_rules_shape
    CHECK (
      (bool_value IS NOT NULL AND int_min IS NULL AND int_max IS NULL)
      OR (
        bool_value IS NULL
        AND int_min IS NOT NULL
        AND int_max IS NOT NULL
        AND int_min <= int_max
      )
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE mentor_assignments
  ADD COLUMN level_id INT NULL DEFAULT NULL;

ALTER TABLE mentor_assignments
  ADD KEY idx_mentor_assignments_level (level_id);

ALTER TABLE mentor_assignments
  ADD CONSTRAINT fk_mentor_assignments_level
    FOREIGN KEY (level_id) REFERENCES theme_levels (id)
    ON DELETE SET NULL;
