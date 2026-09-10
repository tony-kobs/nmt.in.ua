-- Pending paid teacher registration (Mono acquiring).
-- Credentials live here until status=success; then app_users gets role='teacher'.
-- The app also creates this table on first use via ensureTeacherPaymentsSchema().
-- Run in phpMyAdmin or: mysql ... < scripts/sql/014_teacher_payments.sql

CREATE TABLE IF NOT EXISTS teacher_payments (
  id INT NOT NULL AUTO_INCREMENT,
  reference CHAR(32) NOT NULL,
  login VARCHAR(50) NOT NULL,
  display_name VARCHAR(100) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  status ENUM('pending', 'paid', 'failed', 'expired', 'cancelled') NOT NULL DEFAULT 'pending',
  amount_kopiyky INT NOT NULL,
  ccy SMALLINT NOT NULL DEFAULT 980,
  mono_invoice_id VARCHAR(64) NULL,
  user_id INT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_at TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_teacher_payments_reference (reference),
  KEY idx_teacher_payments_login (login),
  KEY idx_teacher_payments_invoice (mono_invoice_id),
  KEY idx_teacher_payments_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
