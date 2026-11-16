-- Landing fields on the existing teacher card. Safe to re-run:
-- a repeated ADD COLUMN is errno 1060 and the migrator skips it.
-- is_public stays the publish flag. Take a backup before production.
-- Numbers 068–071 stay free. Next file after 076_promo_codes.sql.

ALTER TABLE teacher_profiles
  ADD COLUMN photo_url VARCHAR(500) NULL AFTER bio;

ALTER TABLE teacher_profiles
  ADD COLUMN about_text TEXT NULL AFTER photo_url;

ALTER TABLE teacher_profiles
  ADD COLUMN approach TEXT NULL AFTER about_text;

ALTER TABLE teacher_profiles
  ADD COLUMN program TEXT NULL AFTER approach;

ALTER TABLE teacher_profiles
  ADD COLUMN reviews_json TEXT NULL AFTER program;

ALTER TABLE teacher_profiles
  ADD COLUMN external_url VARCHAR(500) NULL AFTER contact_url;
