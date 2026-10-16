-- Columns ensureTeacherProfileSchema adds on top of the original 018 table.
-- Re-running ADD COLUMN fails with errno 1060; `npm run migrate` ignores that.
-- A database created from the updated 018 CREATE already has these columns.

ALTER TABLE teacher_profiles
  ADD COLUMN experience VARCHAR(160) NULL AFTER bio;

ALTER TABLE teacher_profiles
  ADD COLUMN publications TEXT NULL AFTER experience;

ALTER TABLE teacher_profiles
  ADD COLUMN country VARCHAR(80) NULL AFTER city;

ALTER TABLE teacher_profiles
  ADD COLUMN teaching_levels VARCHAR(512) NULL AFTER subjects;

ALTER TABLE teacher_profiles
  ADD COLUMN teaching_languages VARCHAR(512) NULL AFTER teaching_levels;

ALTER TABLE teacher_profiles
  ADD COLUMN phone VARCHAR(32) NULL AFTER contact_url;

ALTER TABLE teacher_profiles
  ADD COLUMN lesson_price DECIMAL(12,2) NULL AFTER teaching_languages;

ALTER TABLE teacher_profiles
  ADD COLUMN lesson_currency CHAR(3) NULL AFTER lesson_price;

ALTER TABLE teacher_profiles
  ADD COLUMN lesson_duration_minutes SMALLINT UNSIGNED NULL AFTER lesson_currency;

ALTER TABLE teacher_profiles
  ADD COLUMN join_motivation TEXT NULL AFTER lesson_duration_minutes;

ALTER TABLE teacher_profiles
  ADD COLUMN moderation_status ENUM('draft', 'pending', 'approved', 'rejected')
    NOT NULL DEFAULT 'draft' AFTER join_motivation,
  ADD KEY idx_teacher_profiles_moderation_status (moderation_status);

UPDATE teacher_profiles
SET moderation_status = 'approved'
WHERE is_public = 1 AND moderation_status = 'draft';

ALTER TABLE teacher_profiles
  ADD COLUMN submitted_at TIMESTAMP NULL DEFAULT NULL AFTER moderation_status;

ALTER TABLE teacher_profiles
  ADD COLUMN reviewed_at TIMESTAMP NULL DEFAULT NULL AFTER submitted_at;

ALTER TABLE teacher_profiles
  ADD COLUMN reviewed_by INT NULL AFTER reviewed_at;

ALTER TABLE teacher_profiles
  ADD COLUMN rejection_reason VARCHAR(1000) NULL AFTER reviewed_by;
