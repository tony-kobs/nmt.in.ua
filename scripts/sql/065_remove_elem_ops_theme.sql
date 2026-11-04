-- Remove cabinet theme id 1 «Елементарні дії» (MATH-05-ELEM-OPS).
-- Idempotent: every delete matches id = 1 AND this code. A different theme
-- that still occupies id 1 is left untouched. A second run changes nothing.
--
-- Student attempts stay in task_sessions (score, time, counts). The bank
-- question and the rows that point at it are removed, so opening that
-- attempt has no questions left. Lists label theme id 1 as «Елементарні дії».
-- Official NMT rows (tasks2session.task_type = 4) are not deleted even when
-- the numeric task id collides with a quiz_tasks id. Their theme_id is cleared.
--
-- Number 065, not 064: 064 stays free so a parallel pull request can take it.
-- Take a database backup before production.
-- Dry-run counts (no writes): node scripts/report-retired-elem-ops.mjs

-- Literal backslash-n (two characters) plus real newlines, then surrounding spaces.
-- CHAR_LENGTH, not `<>`: utf8mb4 collations ignore trailing spaces, so a name
-- that only has a trailing space would otherwise look unchanged.
UPDATE themes
SET name = TRIM(REPLACE(REPLACE(REPLACE(name, '\\n', ''), CHAR(10), ''), CHAR(13), ''))
WHERE CHAR_LENGTH(TRIM(REPLACE(REPLACE(REPLACE(name, '\\n', ''), CHAR(10), ''), CHAR(13), ''))) > 0
  AND CHAR_LENGTH(name) <> CHAR_LENGTH(TRIM(REPLACE(REPLACE(REPLACE(name, '\\n', ''), CHAR(10), ''), CHAR(13), '')));

DELETE origin_row
FROM practice_task_origin origin_row
INNER JOIN tasks2session t2s ON t2s.id = origin_row.tasks2session_id
INNER JOIN quiz_tasks q ON q.id = t2s.task_id AND t2s.task_type = 1
INNER JOIN themes th ON th.id = q.theme_id AND th.id = 1 AND th.code = 'MATH-05-ELEM-OPS';

DELETE t2s
FROM tasks2session t2s
INNER JOIN quiz_tasks q ON q.id = t2s.task_id AND t2s.task_type = 1
INNER JOIN themes th ON th.id = q.theme_id AND th.id = 1 AND th.code = 'MATH-05-ELEM-OPS';

DELETE day_task
FROM marathon_day_tasks day_task
INNER JOIN quiz_tasks q ON q.id = day_task.question_id
INNER JOIN themes th ON th.id = q.theme_id AND th.id = 1 AND th.code = 'MATH-05-ELEM-OPS';

DELETE session_task
FROM session_tasks session_task
INNER JOIN quiz_tasks q ON q.id = session_task.quiz_task_id
INNER JOIN themes th ON th.id = q.theme_id AND th.id = 1 AND th.code = 'MATH-05-ELEM-OPS';

UPDATE mentor_assignments assignment
LEFT JOIN sessions learning_session ON learning_session.id = assignment.session_id
LEFT JOIN themes session_theme ON session_theme.id = learning_session.theme_id
LEFT JOIN themes assignment_theme ON assignment_theme.id = assignment.theme_id
SET assignment.session_id = NULL
WHERE (session_theme.id = 1 AND session_theme.code = 'MATH-05-ELEM-OPS')
   OR (assignment_theme.id = 1 AND assignment_theme.code = 'MATH-05-ELEM-OPS');

DELETE assignment
FROM mentor_assignments assignment
INNER JOIN themes th ON th.id = assignment.theme_id AND th.id = 1 AND th.code = 'MATH-05-ELEM-OPS';

DELETE session_task
FROM session_tasks session_task
INNER JOIN sessions learning_session ON learning_session.id = session_task.session_id
INNER JOIN themes th ON th.id = learning_session.theme_id AND th.id = 1 AND th.code = 'MATH-05-ELEM-OPS';

DELETE learning_session
FROM sessions learning_session
INNER JOIN themes th ON th.id = learning_session.theme_id AND th.id = 1 AND th.code = 'MATH-05-ELEM-OPS';

DELETE FROM user_self_scores
WHERE theme_id = 1
  AND NOT EXISTS (
    SELECT 1 FROM themes th
    WHERE th.id = 1 AND th.code <> 'MATH-05-ELEM-OPS'
  );

DELETE problem
FROM problems problem
INNER JOIN themes th ON th.id = problem.theme_id AND th.id = 1 AND th.code = 'MATH-05-ELEM-OPS';

UPDATE nmt_quiz_tasks nmt
INNER JOIN themes th ON th.id = nmt.theme_id AND th.id = 1 AND th.code = 'MATH-05-ELEM-OPS'
SET nmt.theme_id = NULL;

DELETE edge
FROM theme_connections edge
INNER JOIN themes th ON th.id = 1 AND th.code = 'MATH-05-ELEM-OPS'
WHERE edge.vertex_start = th.id OR edge.vertex_finish = th.id;

DELETE FROM user_notifications
WHERE link LIKE '%topic=MATH-05-ELEM-OPS'
   OR link LIKE '%topic=MATH-05-ELEM-OPS&%';

DELETE FROM user_notifications
WHERE (link = '/?theme=1' OR link LIKE '/?theme=1&%')
  AND NOT EXISTS (
    SELECT 1 FROM themes th
    WHERE th.id = 1 AND th.code <> 'MATH-05-ELEM-OPS'
  );

DELETE FROM textbook_section_versions WHERE theme_code = 'MATH-05-ELEM-OPS';

DELETE FROM textbook_sections WHERE theme_code = 'MATH-05-ELEM-OPS';

DELETE q
FROM quiz_tasks q
INNER JOIN themes th ON th.id = q.theme_id AND th.id = 1 AND th.code = 'MATH-05-ELEM-OPS';

DELETE FROM themes WHERE id = 1 AND code = 'MATH-05-ELEM-OPS';
