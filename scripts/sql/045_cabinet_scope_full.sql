-- Marathon registration now opens the full cabinet.
-- 041 once marked some students as cabinet_scope = 'marathon'.
-- ensureAuthSchema / migrateDailyMarathon repeat this update; it is safe to re-run.
-- Runs after 041 so a fresh migrate does not leave those rows on the old scope.

UPDATE app_users
SET cabinet_scope = 'full'
WHERE cabinet_scope = 'marathon';
