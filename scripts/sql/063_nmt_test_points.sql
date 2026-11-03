-- NMT simulator test points (official scheme: 1 / pair / 2, max depends on the paper).
--
-- tasks2session.awarded_points
--   Points for one simulator answer, including a partial match (0–3).
--   NULL on topic-test rows and on simulator rows answered before this column.
-- task_sessions.test_points / test_points_max
--   Paper total written when the attempt is finished.
--
-- Finished attempts are backfilled from the stored right/wrong flag.
-- A matching task then scores 3 only when every pair was correct, because
-- the student's pairs were not kept. New answers write awarded_points.

ALTER TABLE tasks2session
  ADD COLUMN awarded_points TINYINT NULL DEFAULT NULL;

ALTER TABLE task_sessions
  ADD COLUMN test_points SMALLINT NULL DEFAULT NULL;

ALTER TABLE task_sessions
  ADD COLUMN test_points_max SMALLINT NULL DEFAULT NULL;

UPDATE task_sessions ts
INNER JOIN (
  SELECT
    t2s.session_id AS session_id,
    SUM(
      CASE
        WHEN COALESCE(t2s.first_attempt_status, t2s.status) <> 1 THEN 0
        WHEN nqt.task_kind = 'open' THEN 2
        WHEN nqt.task_kind = 'match' THEN 3
        ELSE 1
      END
    ) AS points,
    SUM(
      CASE
        WHEN nqt.task_kind = 'open' THEN 2
        WHEN nqt.task_kind = 'match' THEN 3
        ELSE 1
      END
    ) AS max_points
  FROM tasks2session t2s
  INNER JOIN nmt_quiz_tasks nqt
    ON nqt.id = t2s.task_id AND t2s.task_type = 4
  GROUP BY t2s.session_id
) scored ON scored.session_id = ts.id
SET
  ts.test_points = scored.points,
  ts.test_points_max = scored.max_points
WHERE ts.session_type = 4
  AND ts.session_status = 1
  AND ts.test_points IS NULL;
