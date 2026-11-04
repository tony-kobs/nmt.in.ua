-- Short nudge for the task-card lightbulb.
-- `comments` stays the worked solution and is not shown on the bulb.
-- Filling hint_short is scripts/short-hints.mjs --apply. That script is not
-- part of deploy. An empty hint_short means the bulb stays hidden.
-- Theme ids are not touched.

ALTER TABLE quiz_tasks
  ADD COLUMN hint_short VARCHAR(280) NULL AFTER hint_rule;
