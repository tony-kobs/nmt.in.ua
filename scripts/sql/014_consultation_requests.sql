-- Consultation requests (student → all teachers). Safe to re-run.
-- mysql ... < scripts/sql/014_consultation_requests.sql

CREATE TABLE IF NOT EXISTS consultation_requests (
  id INT NOT NULL AUTO_INCREMENT,
  student_id INT NOT NULL,
  note TEXT NULL,
  status ENUM('pending', 'acknowledged', 'closed') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  acknowledged_at TIMESTAMP NULL DEFAULT NULL,
  closed_at TIMESTAMP NULL DEFAULT NULL,
  handled_by INT NULL,
  PRIMARY KEY (id),
  KEY idx_consultation_requests_student_status (student_id, status),
  KEY idx_consultation_requests_status_created (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
