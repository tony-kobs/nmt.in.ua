-- Parent-student links and one-time invitations. Requires app_users (001).
-- Take a database backup before applying on production.
-- Adds the parent role without changing any existing account's role.
-- Parent registration is invitation-only; implemented separately.
-- Append the ENUM value to preserve existing role indexes.
-- Idempotent: ALTER repeats the same ENUM, CREATE TABLE IF NOT EXISTS
-- does not duplicate parent_students or parent_invites.

ALTER TABLE app_users
  MODIFY COLUMN role ENUM('student', 'teacher', 'admin', 'dev', 'parent') NOT NULL;

CREATE TABLE IF NOT EXISTS parent_students (
  parent_user_id INT NOT NULL,
  student_user_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (parent_user_id, student_user_id),
  KEY idx_parent_students_student (student_user_id),
  CONSTRAINT fk_parent_students_parent
    FOREIGN KEY (parent_user_id) REFERENCES app_users (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_parent_students_student
    FOREIGN KEY (student_user_id) REFERENCES app_users (id)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Store only a SHA-256 hash of a cryptographically random invitation token,
-- following auth_tokens (023). Never store the raw token in this table.
-- Each invitation grants a link to one student, to the authenticated account
-- that redeems it. Who may issue an invitation is a future server-side check.
-- Redemption must check expires_at > CURRENT_TIMESTAMP, used_at IS NULL and
-- revoked_at IS NULL, then consume the invitation and insert parent_students
-- in one transaction with a row lock or a conditional update. The DDL alone
-- does not enforce one-time use or validate the accounts' roles / distinct ids.
-- used_at remains set if the redeeming account is deleted: SET NULL on
-- used_by_user_id must never make a consumed invitation reusable.

CREATE TABLE IF NOT EXISTS parent_invites (
  id INT NOT NULL AUTO_INCREMENT,
  student_user_id INT NOT NULL,
  created_by_user_id INT NOT NULL,
  token_hash CHAR(64) NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP NULL DEFAULT NULL,
  used_by_user_id INT NULL DEFAULT NULL,
  revoked_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_parent_invites_token_hash (token_hash),
  KEY idx_parent_invites_student (student_user_id, created_at),
  KEY idx_parent_invites_creator (created_by_user_id),
  KEY idx_parent_invites_used_by (used_by_user_id),
  KEY idx_parent_invites_expires (expires_at),
  CONSTRAINT fk_parent_invites_student
    FOREIGN KEY (student_user_id) REFERENCES app_users (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_parent_invites_creator
    FOREIGN KEY (created_by_user_id) REFERENCES app_users (id)
    ON DELETE CASCADE,
  CONSTRAINT fk_parent_invites_used_by
    FOREIGN KEY (used_by_user_id) REFERENCES app_users (id)
    ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
