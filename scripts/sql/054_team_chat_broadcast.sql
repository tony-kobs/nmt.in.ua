-- Take a database backup before applying this on production.
-- Drafts of /all in the team support group, and the group message id of a forwarded ticket.

CREATE TABLE IF NOT EXISTS marathon_team_broadcasts (
  id BIGINT NOT NULL AUTO_INCREMENT,
  marathon_id INT NOT NULL,
  author_tg_id VARCHAR(32) NOT NULL,
  body VARCHAR(4000) NOT NULL,
  status ENUM('draft', 'sent', 'cancelled') NOT NULL DEFAULT 'draft',
  recipient_count INT UNSIGNED NOT NULL DEFAULT 0,
  sent_count INT UNSIGNED NOT NULL DEFAULT 0,
  preview_chat_id VARCHAR(32) NOT NULL,
  preview_message_id BIGINT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  confirmed_at TIMESTAMP NULL,
  PRIMARY KEY (id),
  KEY idx_team_broadcast_status (status, expires_at),
  CONSTRAINT fk_team_broadcast_marathon FOREIGN KEY (marathon_id)
    REFERENCES marathons (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE support_tickets
  ADD COLUMN forward_message_id BIGINT NULL AFTER reply_text,
  ADD KEY idx_support_tickets_forward (forward_message_id);
