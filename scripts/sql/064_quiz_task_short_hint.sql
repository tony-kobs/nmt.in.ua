-- Short nudge for the task-card lightbulb.
-- `comments` stays the worked solution and is not shown on the bulb.
-- Filling hint_short is scripts/short-hints.mjs --apply. That script is not
-- part of deploy. An empty hint_short means the bulb stays hidden.
--
-- A catalog title «Назва теми — 35» is moved onto that theme when exactly
-- one theme name matches, so the topic-test bank is not stuck on a stray id.

ALTER TABLE quiz_tasks
  ADD COLUMN hint_short VARCHAR(280) NULL AFTER hint_rule;

UPDATE quiz_tasks q
INNER JOIN themes t ON (
  q.name = t.name
  OR q.name LIKE CONCAT(t.name, ' — %')
  OR q.name LIKE CONCAT(t.name, ' - %')
)
LEFT JOIN themes other ON other.id <> t.id AND (
  q.name = other.name
  OR q.name LIKE CONCAT(other.name, ' — %')
  OR q.name LIKE CONCAT(other.name, ' - %')
)
SET q.theme_id = t.id
WHERE other.id IS NULL
  AND q.theme_id <> t.id;
