-- Legacy content tables that existed on the shared host before this repo:
-- themes, theme_connections, quiz_tasks, task_sessions, tasks2session.
--
-- Production already recorded this filename in schema_migrations, so deploy
-- does not run the statements below again. A fresh local database (see
-- docs/LOCAL_DEV.md) has no such history: CREATE IF NOT EXISTS gives the
-- later ALTER files (004, 006, 009, 010, …) a table to change.
--
-- Shapes here are only the columns those ALTER files assume already exist.
-- New columns (code, difficulty, guest_token, expire_time, hints, …) stay
-- in the numbered files, same as on the hosting database.
-- CREATE IF NOT EXISTS does not touch a table that is already there.

CREATE TABLE IF NOT EXISTS themes (
  id INT NOT NULL AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  ord INT NOT NULL DEFAULT 0,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS theme_connections (
  id INT NOT NULL AUTO_INCREMENT,
  vertex_start INT NOT NULL,
  vertex_finish INT NOT NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS quiz_tasks (
  id INT NOT NULL AUTO_INCREMENT,
  name VARCHAR(255) NOT NULL,
  task_text TEXT NOT NULL,
  theme_id INT NOT NULL,
  answer_1 VARCHAR(255) NOT NULL,
  answer_2 VARCHAR(255) NOT NULL,
  answer_3 VARCHAR(255) NOT NULL,
  answer_4 VARCHAR(255) NOT NULL,
  right_answer_n TINYINT NOT NULL,
  comments TEXT NOT NULL,
  PRIMARY KEY (id),
  KEY idx_quiz_tasks_theme_id (theme_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS task_sessions (
  id INT NOT NULL AUTO_INCREMENT,
  user_id INT NOT NULL,
  session_type TINYINT NOT NULL,
  theme_id INT NOT NULL,
  tasks_number INT NOT NULL DEFAULT 0,
  right_number INT NOT NULL DEFAULT 0,
  `time` INT NOT NULL DEFAULT 0,
  session_status INT NOT NULL,
  start_time INT UNSIGNED NOT NULL DEFAULT 0,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tasks2session (
  id INT NOT NULL AUTO_INCREMENT,
  task_type TINYINT NOT NULL,
  task_id INT NOT NULL,
  session_id INT NOT NULL,
  user_id INT NOT NULL,
  status SMALLINT NOT NULL DEFAULT 0,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
