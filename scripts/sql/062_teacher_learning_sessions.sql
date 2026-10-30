-- Take a database backup before applying this on production.
-- Run it manually (`npm run migrate`) after that backup. Deploy also applies
-- unrecorded files, so the backup has to exist before the release swap.
--
-- Teacher-owned task lists live in `sessions` / `session_tasks`.
-- `mentor_assignments.session_id` points at that list.
-- `mentor_assignment_members.session_id` stays the student's `task_sessions` row.
--
-- Backfill: one session per assignment that does not have one yet.
-- `sessions.legacy_assignment_id` is only the link for that backfill.
-- If a student already started, the session copies that attempt's tasks in
-- mapping order. The attempt with the earliest `tasks2session.id` wins when
-- several students received different random sets. Other attempts are not
-- rewritten. If nobody started, the session freezes the first N bank tasks
-- of that theme and level (`quiz_tasks.id` order, N = tasks_number, at most 200).
-- The started case matches `chooseMigratedTaskIds`.

ALTER TABLE mentor_assignments
  ADD COLUMN difficulty INT UNSIGNED NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS sessions (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  teacher_user_id INT NOT NULL,
  title VARCHAR(160) NOT NULL,
  theme_id INT NOT NULL,
  difficulty INT UNSIGNED NOT NULL DEFAULT 1,
  origin ENUM('manual', 'quick', 'migrated') NOT NULL DEFAULT 'manual',
  legacy_assignment_id INT UNSIGNED NULL DEFAULT NULL,
  created_at INT UNSIGNED NOT NULL,
  updated_at INT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_sessions_legacy_assignment (legacy_assignment_id),
  KEY idx_sessions_teacher (teacher_user_id, updated_at),
  KEY idx_sessions_theme (theme_id),
  CONSTRAINT fk_sessions_teacher
    FOREIGN KEY (teacher_user_id) REFERENCES app_users (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_sessions_theme
    FOREIGN KEY (theme_id) REFERENCES themes (id)
    ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE sessions
  ADD COLUMN legacy_assignment_id INT UNSIGNED NULL DEFAULT NULL;

ALTER TABLE sessions
  ADD UNIQUE KEY uq_sessions_legacy_assignment (legacy_assignment_id);

CREATE TABLE IF NOT EXISTS session_tasks (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  session_id INT UNSIGNED NOT NULL,
  quiz_task_id INT NOT NULL,
  position INT UNSIGNED NOT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_session_tasks_order (session_id, position),
  UNIQUE KEY uq_session_tasks_task (session_id, quiz_task_id),
  KEY idx_session_tasks_quiz (quiz_task_id),
  CONSTRAINT fk_session_tasks_session
    FOREIGN KEY (session_id) REFERENCES sessions (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE mentor_assignments
  ADD COLUMN session_id INT UNSIGNED NULL DEFAULT NULL;

ALTER TABLE mentor_assignments
  ADD KEY idx_mentor_assignments_learning_session (session_id);

ALTER TABLE mentor_assignments
  ADD CONSTRAINT fk_mentor_assignments_learning_session
    FOREIGN KEY (session_id) REFERENCES sessions (id)
    ON DELETE RESTRICT;

INSERT INTO sessions (
  teacher_user_id,
  title,
  theme_id,
  difficulty,
  origin,
  legacy_assignment_id,
  created_at,
  updated_at
)
SELECT
  a.teacher_user_id,
  LEFT(CONCAT(t.name, ' · рівень ', IFNULL(a.difficulty, 1)), 160),
  a.theme_id,
  IFNULL(a.difficulty, 1),
  'migrated',
  a.id,
  a.created_at,
  a.created_at
FROM mentor_assignments a
INNER JOIN themes t ON t.id = a.theme_id
WHERE a.session_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM sessions s WHERE s.legacy_assignment_id = a.id
  );

UPDATE mentor_assignments a
INNER JOIN sessions s ON s.legacy_assignment_id = a.id
SET a.session_id = s.id
WHERE a.session_id IS NULL;

INSERT INTO session_tasks (session_id, quiz_task_id, position)
SELECT s.id, task_row.task_id, task_row.pos
FROM sessions s
INNER JOIN (
  SELECT per_attempt.assignment_id, per_attempt.session_id
  FROM (
    SELECT m.assignment_id, m.session_id, MIN(t2s.id) AS first_id
    FROM mentor_assignment_members m
    INNER JOIN tasks2session t2s ON t2s.session_id = m.session_id
    GROUP BY m.assignment_id, m.session_id
  ) per_attempt
  INNER JOIN (
    SELECT m.assignment_id, MIN(t2s.id) AS first_id
    FROM mentor_assignment_members m
    INNER JOIN tasks2session t2s ON t2s.session_id = m.session_id
    GROUP BY m.assignment_id
  ) winner
    ON winner.assignment_id = per_attempt.assignment_id
   AND winner.first_id = per_attempt.first_id
) src ON src.assignment_id = s.legacy_assignment_id
INNER JOIN (
  SELECT
    t2s.session_id,
    t2s.task_id,
    (
      SELECT COUNT(*)
      FROM tasks2session earlier
      INNER JOIN (
        SELECT session_id, task_id, MIN(id) AS id
        FROM tasks2session
        GROUP BY session_id, task_id
      ) earlier_deduped ON earlier_deduped.id = earlier.id
      WHERE earlier.session_id = t2s.session_id
        AND earlier.id <= t2s.id
    ) AS pos
  FROM tasks2session t2s
  INNER JOIN (
    SELECT session_id, task_id, MIN(id) AS id
    FROM tasks2session
    GROUP BY session_id, task_id
  ) deduped ON deduped.id = t2s.id
) task_row ON task_row.session_id = src.session_id
WHERE s.origin = 'migrated'
  AND NOT EXISTS (
    SELECT 1 FROM session_tasks already WHERE already.session_id = s.id
  );

INSERT INTO session_tasks (session_id, quiz_task_id, position)
SELECT s.id, picked.id, picked.pos
FROM sessions s
INNER JOIN mentor_assignments a ON a.id = s.legacy_assignment_id
INNER JOIN (
  SELECT
    q.theme_id,
    q.difficulty,
    q.id,
    (
      SELECT COUNT(*)
      FROM quiz_tasks earlier
      WHERE earlier.theme_id = q.theme_id
        AND earlier.difficulty = q.difficulty
        AND earlier.id <= q.id
    ) AS pos
  FROM quiz_tasks q
) picked
  ON picked.theme_id = a.theme_id
 AND picked.difficulty = a.difficulty
 AND picked.pos <= IF(
   IFNULL(a.tasks_number, 10) < 1,
   10,
   LEAST(a.tasks_number, 200)
 )
WHERE s.origin = 'migrated'
  AND NOT EXISTS (
    SELECT 1 FROM session_tasks already WHERE already.session_id = s.id
  );
