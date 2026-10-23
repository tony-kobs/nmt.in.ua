-- Take a database backup before applying this on production.
-- A reply to a support ticket quotes the question and can continue on the same row.

ALTER TABLE support_tickets
  ADD COLUMN body_kind ENUM('text', 'photo') NOT NULL DEFAULT 'text' AFTER body;

CREATE TABLE IF NOT EXISTS support_ticket_entries (
  id BIGINT NOT NULL AUTO_INCREMENT,
  ticket_id BIGINT NOT NULL,
  author ENUM('student', 'staff') NOT NULL,
  body VARCHAR(4000) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_support_ticket_entries_ticket (ticket_id, id),
  CONSTRAINT fk_support_ticket_entries_ticket
    FOREIGN KEY (ticket_id) REFERENCES support_tickets (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS support_reply_links (
  chat_id VARCHAR(32) NOT NULL,
  message_id BIGINT NOT NULL,
  ticket_id BIGINT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (chat_id, message_id),
  KEY idx_support_reply_links_ticket (ticket_id),
  CONSTRAINT fk_support_reply_links_ticket
    FOREIGN KEY (ticket_id) REFERENCES support_tickets (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS support_follow_waits (
  chat_id VARCHAR(32) NOT NULL,
  ticket_id BIGINT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (chat_id),
  KEY idx_support_follow_waits_ticket (ticket_id),
  CONSTRAINT fk_support_follow_waits_ticket
    FOREIGN KEY (ticket_id) REFERENCES support_tickets (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
