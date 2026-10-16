-- Recovery copy. The app also creates these through ensure-schema.
-- user_channel_preferences: category marathon | news | system.
-- marathons.invite_audience ENUM('none','students','all') NOT NULL DEFAULT 'none'
-- is added by ensure-schema. Skip the ALTER if the column already exists.
-- marathon_invite_dispatches: one row per marathon, claimed on first activation.

CREATE TABLE IF NOT EXISTS user_channel_preferences (
  user_id INT NOT NULL,
  category VARCHAR(16) NOT NULL,
  email_on TINYINT(1) NOT NULL,
  telegram_on TINYINT(1) NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, category),
  CONSTRAINT fk_user_channel_pref_user FOREIGN KEY (user_id)
    REFERENCES app_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS marathon_invite_dispatches (
  marathon_id INT NOT NULL,
  audience VARCHAR(16) NOT NULL,
  sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (marathon_id),
  CONSTRAINT fk_marathon_invite_dispatch FOREIGN KEY (marathon_id)
    REFERENCES marathons (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS marathon_invite_recipients (
  marathon_id INT NOT NULL,
  user_id INT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (marathon_id, user_id),
  KEY idx_invite_recipient_user (user_id, marathon_id),
  CONSTRAINT fk_marathon_invite_recipient_marathon FOREIGN KEY (marathon_id)
    REFERENCES marathons (id) ON DELETE CASCADE,
  CONSTRAINT fk_marathon_invite_recipient_user FOREIGN KEY (user_id)
    REFERENCES app_users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One-time copy from the old per-marathon flags. INSERT IGNORE keeps a later edit.
-- Same statement as applyChannelPreferencesSchema. Missing source columns are a
-- real failure (do not record this file). Re-running does not overwrite.
INSERT IGNORE INTO user_channel_preferences (user_id, category, email_on, telegram_on)
SELECT p.user_id, 'marathon',
  MAX(CASE WHEN p.notify_paused = 0 AND p.notify_email <> 0 THEN 1 ELSE 0 END),
  MAX(CASE WHEN p.notify_paused = 0 AND p.notify_bot <> 0 THEN 1 ELSE 0 END)
FROM marathon_participants p
GROUP BY p.user_id;
