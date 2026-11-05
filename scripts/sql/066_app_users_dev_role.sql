-- Developer role. Appended so existing ENUM indexes for student/teacher/admin stay put.
-- Does not change any account. Assign afterwards:
--   node scripts/promote-dev.mjs <login>

ALTER TABLE app_users
  MODIFY COLUMN role ENUM('student', 'teacher', 'admin', 'dev') NOT NULL;
