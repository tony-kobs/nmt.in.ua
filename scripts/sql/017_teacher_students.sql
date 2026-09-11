-- Teacher ↔ student links (manual add by login). Safe to re-run.
-- Requires app_users (scripts/sql/001_app_users.sql).
-- mysql ... < scripts/sql/017_teacher_students.sql
--
-- Lazy create: src/modules/teacher-students/schema.ts::ensureTeacherStudentsSchema
-- (same statement). Next free number after 016_consultation_requests.sql on
-- feature/consultations-requests (#85).

CREATE TABLE IF NOT EXISTS teacher_students (
  teacher_user_id INT NOT NULL,
  student_user_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (teacher_user_id, student_user_id),
  KEY idx_teacher_students_student (student_user_id),
  CONSTRAINT fk_teacher_students_teacher
    FOREIGN KEY (teacher_user_id) REFERENCES app_users (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_teacher_students_student
    FOREIGN KEY (student_user_id) REFERENCES app_users (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
