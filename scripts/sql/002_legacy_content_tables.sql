-- Legacy content tables already lived on the shared host before this repo:
-- themes, theme_connections, quiz_tasks, task_sessions, tasks2session.
-- ensure*Schema does not create them. This file only closes the numbering gap
-- so `npm run migrate` can record the version. It does not change data.

SELECT 1;
