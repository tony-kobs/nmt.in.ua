import type { SqlConnection } from "@/lib/db/mysql";
import { applyChannelPreferencesSchema } from "@/modules/notifications/channelSchema";
import { createUserNotificationsTable } from "@/modules/notifications/schema";
import { backfillTelegramLinks } from "@/modules/telegram/linkSync";
import { ONEMATH_PUBLIC_CHAT } from "./daily/publicChat";

const CHILD_TABLES = [
  `CREATE TABLE IF NOT EXISTS marathon_riddles (
    id INT NOT NULL AUTO_INCREMENT,
    marathon_id INT NOT NULL,
    sort_order INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    answer VARCHAR(512) NOT NULL,
    hint TEXT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_marathon_riddle_order (marathon_id, sort_order),
    KEY idx_marathon_riddle (marathon_id),
    CONSTRAINT fk_marathon_riddle FOREIGN KEY (marathon_id) REFERENCES marathons (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS marathon_days (
    id INT NOT NULL AUTO_INCREMENT,
    marathon_id INT NOT NULL,
    day_number TINYINT UNSIGNED NOT NULL,
    topic VARCHAR(255) NOT NULL,
    intro_text TEXT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_marathon_day_number (marathon_id, day_number),
    CONSTRAINT fk_marathon_day FOREIGN KEY (marathon_id) REFERENCES marathons (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS marathon_day_materials (
    id INT NOT NULL AUTO_INCREMENT,
    day_id INT NOT NULL,
    sort_order INT NOT NULL,
    material_type ENUM('loom', 'youtube', 'text') NOT NULL,
    url_or_body MEDIUMTEXT NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_marathon_material_order (day_id, sort_order),
    CONSTRAINT fk_marathon_material_day FOREIGN KEY (day_id) REFERENCES marathon_days (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS marathon_day_tasks (
    id INT NOT NULL AUTO_INCREMENT,
    day_id INT NOT NULL,
    sort_order INT NOT NULL,
    question_id INT NULL,
    inline_prompt TEXT NULL,
    inline_options TEXT NULL,
    inline_correct TINYINT NULL,
    inline_explanation TEXT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_marathon_task_order (day_id, sort_order),
    KEY idx_marathon_task_question (question_id),
    CONSTRAINT fk_marathon_task_day FOREIGN KEY (day_id) REFERENCES marathon_days (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS marathon_day_progress (
    marathon_id INT NOT NULL,
    user_id INT NOT NULL,
    day_id INT NOT NULL,
    materials_viewed_at TIMESTAMP NULL DEFAULT NULL,
    score TINYINT UNSIGNED NULL,
    passed TINYINT(1) NOT NULL DEFAULT 0,
    completed_at TIMESTAMP NULL DEFAULT NULL,
    answers_json TEXT NULL,
    PRIMARY KEY (marathon_id, user_id, day_id),
    CONSTRAINT fk_marathon_progress_participant FOREIGN KEY (marathon_id, user_id)
      REFERENCES marathon_participants (marathon_id, user_id) ON DELETE CASCADE,
    CONSTRAINT fk_marathon_progress_day FOREIGN KEY (day_id)
      REFERENCES marathon_days (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS marathon_notifications (
    marathon_id INT NOT NULL,
    user_id INT NOT NULL,
    day_number TINYINT UNSIGNED NOT NULL,
    kind ENUM('day_open', 'reminder', 'tomorrow', 'final', 'nudge', 'registered') NOT NULL,
    channel ENUM('email', 'telegram') NOT NULL,
    sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    delivered TINYINT(1) NOT NULL DEFAULT 1,
    PRIMARY KEY (marathon_id, user_id, day_number, kind, channel)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS marathon_ranks (
    marathon_id INT NOT NULL,
    user_id INT NOT NULL,
    place SMALLINT UNSIGNED NOT NULL,
    prev_place SMALLINT UNSIGNED NULL,
    points INT UNSIGNED NOT NULL DEFAULT 0,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (marathon_id, user_id),
    CONSTRAINT fk_marathon_ranks_participant FOREIGN KEY (marathon_id, user_id)
      REFERENCES marathon_participants (marathon_id, user_id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS marathon_copy (
    marathon_id INT NOT NULL,
    copy_key VARCHAR(64) NOT NULL,
    body TEXT NOT NULL,
    PRIMARY KEY (marathon_id, copy_key),
    CONSTRAINT fk_marathon_copy FOREIGN KEY (marathon_id) REFERENCES marathons (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS marathon_bot_tokens (
    token VARCHAR(40) NOT NULL,
    marathon_id INT NOT NULL,
    user_id INT NOT NULL,
    payload VARCHAR(240) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (token),
    KEY idx_marathon_bot_tokens_user (marathon_id, user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS marathon_telegram_outbox (
    id BIGINT NOT NULL AUTO_INCREMENT,
    chat_id VARCHAR(32) NOT NULL,
    payload MEDIUMTEXT NOT NULL,
    status ENUM('pending','sent','failed') NOT NULL DEFAULT 'pending',
    not_before TIMESTAMP NULL DEFAULT NULL,
    attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_marathon_tg_outbox (status, not_before, id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS marathon_declines (
    marathon_id INT NOT NULL,
    user_id INT NOT NULL,
    declined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (marathon_id, user_id),
    CONSTRAINT fk_marathon_decline_marathon FOREIGN KEY (marathon_id)
      REFERENCES marathons (id) ON DELETE CASCADE,
    CONSTRAINT fk_marathon_decline_user FOREIGN KEY (user_id)
      REFERENCES app_users (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS marathon_invite_dispatches (
    marathon_id INT NOT NULL,
    audience VARCHAR(16) NOT NULL,
    sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (marathon_id),
    CONSTRAINT fk_marathon_invite_dispatch FOREIGN KEY (marathon_id)
      REFERENCES marathons (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS marathon_invite_recipients (
    marathon_id INT NOT NULL,
    user_id INT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (marathon_id, user_id),
    KEY idx_invite_recipient_user (user_id, marathon_id),
    CONSTRAINT fk_marathon_invite_recipient_marathon FOREIGN KEY (marathon_id)
      REFERENCES marathons (id) ON DELETE CASCADE,
    CONSTRAINT fk_marathon_invite_recipient_user FOREIGN KEY (user_id)
      REFERENCES app_users (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS marathon_bot_links (
    id INT NOT NULL AUTO_INCREMENT,
    marathon_id INT NOT NULL,
    user_id INT NOT NULL,
    token_hash CHAR(64) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    consumed_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_marathon_bot_token (token_hash),
    KEY idx_marathon_bot_user (marathon_id, user_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
];

const MARATHON_COLUMNS: Array<[string, string]> = [
  [
    "kind",
    "ENUM('leaderboard','daily') NOT NULL DEFAULT 'leaderboard' AFTER status",
  ],
  ["description", "TEXT NULL AFTER title"],
  ["subject", "VARCHAR(64) NOT NULL DEFAULT 'math' AFTER description"],
  ["start_date", "CHAR(10) NULL AFTER subject"],
  ["unlock_hour", "CHAR(5) NOT NULL DEFAULT '09:00' AFTER start_date"],
  ["reminder_hour", "CHAR(5) NOT NULL DEFAULT '19:00' AFTER unlock_hour"],
  ["nudge_from", "TINYINT UNSIGNED NOT NULL DEFAULT 10 AFTER reminder_hour"],
  ["nudge_until", "TINYINT UNSIGNED NOT NULL DEFAULT 21 AFTER nudge_from"],
  ["days_count", "TINYINT UNSIGNED NOT NULL DEFAULT 5 AFTER nudge_until"],
  ["pass_threshold", "TINYINT UNSIGNED NOT NULL DEFAULT 60 AFTER days_count"],
  ["final_cta_text", "VARCHAR(500) NULL AFTER pass_threshold"],
  ["final_cta_url", "VARCHAR(500) NULL AFTER final_cta_text"],
  ["intro_video_url", "VARCHAR(500) NULL AFTER final_cta_url"],
  ["invite_audience", "ENUM('none','students','all') NOT NULL DEFAULT 'none' AFTER intro_video_url"],
  ["landing_riddle_count", "TINYINT UNSIGNED NOT NULL DEFAULT 3 AFTER invite_audience"],
  ["public_chat_url", "VARCHAR(500) NULL AFTER landing_riddle_count"],
];

const PARTICIPANT_COLUMNS: Array<[string, string]> = [
  ["source", "VARCHAR(512) NULL AFTER joined_at"],
  ["streak", "SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER source"],
  ["finished_at", "TIMESTAMP NULL DEFAULT NULL AFTER streak"],
  ["converted_at", "TIMESTAMP NULL DEFAULT NULL AFTER finished_at"],
  ["telegram_chat_id", "BIGINT NULL AFTER converted_at"],
  ["notify_email", "TINYINT(1) NOT NULL DEFAULT 1 AFTER telegram_chat_id"],
  ["notify_bot", "TINYINT(1) NOT NULL DEFAULT 0 AFTER notify_email"],
  ["delivery_channel", "ENUM('site','telegram') NULL AFTER notify_bot"],
  ["intro_seen_at", "TIMESTAMP NULL DEFAULT NULL AFTER delivery_channel"],
  ["notify_paused", "TINYINT(1) NOT NULL DEFAULT 0 AFTER intro_seen_at"],
  ["telegram_selected_at", "TIMESTAMP NULL AFTER notify_paused"],
];

async function columnNames(
  connection: SqlConnection,
  table: string,
): Promise<Set<string>> {
  const rows = await connection.query<{
    COLUMN_NAME?: string;
    column_name?: string;
  }>(
    `SELECT COLUMN_NAME AS COLUMN_NAME
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table],
  );
  return new Set(
    rows.map((row) => String(row.COLUMN_NAME ?? row.column_name ?? "")),
  );
}

function isDuplicate(error: unknown): boolean {
  const errno = (error as { errno?: number }).errno;
  return errno === 1050 || errno === 1060 || errno === 1061;
}

async function addColumn(
  connection: SqlConnection,
  table: string,
  name: string,
  definition: string,
): Promise<void> {
  try {
    await connection.execute(
      `ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`,
      [],
    );
  } catch (error) {
    if (isDuplicate(error)) return;
    throw error;
  }
}

/**
 * Extends the leaderboard marathon tables and adds the daily-course tables.
 * Called from `ensureMarathonSchema` after the base tables exist.
 * `kind = 'leaderboard'` keeps the existing board off this flow.
 */
export async function migrateDailyMarathon(
  connection: SqlConnection,
): Promise<void> {
  const marathonColumns = await columnNames(connection, "marathons");
  if (marathonColumns.size > 0) {
    for (const [name, definition] of MARATHON_COLUMNS) {
      if (!marathonColumns.has(name)) {
        await addColumn(connection, "marathons", name, definition);
      }
    }
    await connection.execute(
      `UPDATE marathons
       SET public_chat_url = ?
       WHERE slug = ? AND (public_chat_url IS NULL OR public_chat_url = '')`,
      [ONEMATH_PUBLIC_CHAT.url, ONEMATH_PUBLIC_CHAT.slug],
    );
    const statusRows = await connection.query<{
      COLUMN_TYPE?: string;
      column_type?: string;
    }>(
      `SELECT COLUMN_TYPE AS COLUMN_TYPE
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'marathons'
         AND COLUMN_NAME = 'status'`,
      [],
    );
    const statusType = String(
      statusRows[0]?.COLUMN_TYPE ?? statusRows[0]?.column_type ?? "",
    );
    if (statusType && !statusType.includes("finished")) {
      await connection.execute(
        `ALTER TABLE marathons
         MODIFY COLUMN status ENUM('draft','active','archived','finished')
         NOT NULL DEFAULT 'draft'`,
        [],
      );
    }
  }

  const participantColumns = await columnNames(connection, "marathon_participants");
  if (participantColumns.size > 0) {
    for (const [name, definition] of PARTICIPANT_COLUMNS) {
      if (!participantColumns.has(name)) {
        await addColumn(connection, "marathon_participants", name, definition);
      }
    }
  }

  for (const sql of CHILD_TABLES) {
    try {
      await connection.execute(sql, []);
    } catch (error) {
      if (isDuplicate(error)) continue;
      throw error;
    }
  }

  try {
    await connection.execute(
      `CREATE TABLE IF NOT EXISTS marathon_button_labels (
        marathon_id INT NOT NULL,
        callback_data VARCHAR(32) NOT NULL,
        label VARCHAR(64) NOT NULL,
        PRIMARY KEY (marathon_id, callback_data, label),
        CONSTRAINT fk_marathon_button_labels FOREIGN KEY (marathon_id)
          REFERENCES marathons (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      [],
    );
  } catch (error) {
    if (!isDuplicate(error)) throw error;
  }

  for (const sql of [
    `CREATE TABLE IF NOT EXISTS support_tickets (
      id BIGINT NOT NULL AUTO_INCREMENT,
      user_id INT NOT NULL,
      telegram_chat_id VARCHAR(32) NOT NULL,
      marathon_id INT NULL,
      day_number TINYINT UNSIGNED NULL,
      body VARCHAR(4000) NOT NULL,
      status ENUM('new', 'in_progress', 'closed') NOT NULL DEFAULT 'new',
      reply_text VARCHAR(4000) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_support_tickets_status (status, id),
      CONSTRAINT fk_support_tickets_user FOREIGN KEY (user_id) REFERENCES app_users (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS support_waits (
      chat_id VARCHAR(32) NOT NULL,
      user_id INT NOT NULL,
      marathon_id INT NULL,
      day_number TINYINT UNSIGNED NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (chat_id),
      CONSTRAINT fk_support_waits_user FOREIGN KEY (user_id) REFERENCES app_users (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ]) {
    try {
      await connection.execute(sql, []);
    } catch (error) {
      if (!isDuplicate(error)) throw error;
    }
  }

  const taskColumns = await columnNames(connection, "marathon_day_tasks");
  if (taskColumns.size > 0 && !taskColumns.has("inline_explanation")) {
    await addColumn(
      connection,
      "marathon_day_tasks",
      "inline_explanation",
      "TEXT NULL AFTER inline_correct",
    );
  }

  const notifyColumns = await columnNames(connection, "marathon_notifications");
  if (notifyColumns.size > 0 && !notifyColumns.has("delivered")) {
    // Existing rows were written after a send, so they count as delivered.
    await addColumn(
      connection,
      "marathon_notifications",
      "delivered",
      "TINYINT(1) NOT NULL DEFAULT 1 AFTER sent_at",
    );
  }
  if (notifyColumns.has("kind")) {
    const kindRows = await connection.query<{
      COLUMN_TYPE?: string;
      column_type?: string;
    }>(
      `SELECT COLUMN_TYPE AS COLUMN_TYPE
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'marathon_notifications'
         AND COLUMN_NAME = 'kind'`,
      [],
    );
    const kindType = String(
      kindRows[0]?.COLUMN_TYPE ?? kindRows[0]?.column_type ?? "",
    );
    if (kindType && !kindType.includes("registered")) {
      await connection.execute(
        `ALTER TABLE marathon_notifications
         MODIFY COLUMN kind ENUM('day_open','reminder','tomorrow','final','nudge','registered') NOT NULL`,
        [],
      );
    }
  }

  const progressColumns = await columnNames(connection, "marathon_day_progress");
  if (progressColumns.size > 0 && !progressColumns.has("answers_json")) {
    await addColumn(
      connection,
      "marathon_day_progress",
      "answers_json",
      "TEXT NULL AFTER completed_at",
    );
  }
  if (progressColumns.size > 0 && !progressColumns.has("correct_count")) {
    await addColumn(
      connection,
      "marathon_day_progress",
      "correct_count",
      "SMALLINT UNSIGNED NULL AFTER score",
    );
  }

  const userColumns = await columnNames(connection, "app_users");
  if (userColumns.size > 0 && !userColumns.has("cabinet_scope")) {
    await addColumn(
      connection,
      "app_users",
      "cabinet_scope",
      "ENUM('full','marathon') NOT NULL DEFAULT 'full' AFTER role",
    );
  }
  await promoteMarathonCabinets(connection);
  await backfillDailyDescription(connection);
  await createUserNotificationsTable(connection);
  await backfillTelegramLinks(connection);
  await applyChannelPreferencesSchema(connection);
  await ensureRiddleBank(connection);
  await ensureMessageTimeline(connection);
}

const SQL_SCHEMA_FLAGS = `
  CREATE TABLE IF NOT EXISTS marathon_schema_flags (
    name VARCHAR(64) NOT NULL,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (name)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

/** Existing daily rows stored the subject in description. Clear that once. */
async function backfillDailyDescription(connection: SqlConnection): Promise<void> {
  try {
    await connection.execute(SQL_SCHEMA_FLAGS, []);
    const rows = await connection.query<{ name: string }>(
      `SELECT name FROM marathon_schema_flags WHERE name = 'daily_description_split' LIMIT 1`,
      [],
    );
    if (rows.length > 0) return;
    await connection.execute(
      `UPDATE marathons
       SET description = ''
       WHERE kind = 'daily' AND (description IS NULL OR description = subject)`,
      [],
    );
    try {
      await connection.execute(
        `INSERT INTO marathon_schema_flags (name) VALUES ('daily_description_split')`,
        [],
      );
    } catch (error) {
      const errno = (error as { errno?: number }).errno;
      if (errno !== 1062) throw error;
    }
  } catch (error) {
    const errno = (error as { errno?: number }).errno;
    if (errno === 1146 || errno === 1054 || errno === 1062) return;
    throw error;
  }
}

/** Marathon registration now opens the full cabinet. Safe to repeat. */
const SQL_RIDDLE_BANK = `
  CREATE TABLE IF NOT EXISTS riddle_bank (
    id INT NOT NULL AUTO_INCREMENT,
    legacy_riddle_id INT NULL,
    subject VARCHAR(64) NULL,
    visibility ENUM('shared', 'tagged') NOT NULL DEFAULT 'tagged',
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    hint TEXT NULL,
    legacy_answer VARCHAR(512) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_riddle_bank_legacy (legacy_riddle_id),
    KEY idx_riddle_bank_subject (subject, visibility)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const SQL_RIDDLE_OPTIONS = `
  CREATE TABLE IF NOT EXISTS riddle_options (
    id INT NOT NULL AUTO_INCREMENT,
    riddle_id INT NOT NULL,
    sort_order TINYINT UNSIGNED NOT NULL,
    label VARCHAR(512) NOT NULL,
    is_correct TINYINT(1) NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uq_riddle_option_order (riddle_id, sort_order),
    KEY idx_riddle_option_riddle (riddle_id),
    CONSTRAINT fk_riddle_option_riddle FOREIGN KEY (riddle_id)
      REFERENCES riddle_bank (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const SQL_RIDDLE_TAGS = `
  CREATE TABLE IF NOT EXISTS riddle_marathon_tags (
    riddle_id INT NOT NULL,
    marathon_id INT NOT NULL,
    PRIMARY KEY (riddle_id, marathon_id),
    KEY idx_riddle_tag_marathon (marathon_id),
    CONSTRAINT fk_riddle_tag_riddle FOREIGN KEY (riddle_id)
      REFERENCES riddle_bank (id) ON DELETE CASCADE,
    CONSTRAINT fk_riddle_tag_marathon FOREIGN KEY (marathon_id)
      REFERENCES marathons (id) ON DELETE CASCADE
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

const SQL_COPY_RIDDLES = `
  INSERT INTO riddle_bank (
    legacy_riddle_id, subject, visibility, title, body, hint, legacy_answer
  )
  SELECT r.id, NULLIF(m.subject, ''), 'tagged', r.title, r.body, r.hint, r.answer
  FROM marathon_riddles r
  INNER JOIN marathons m ON m.id = r.marathon_id
  WHERE NOT EXISTS (
    SELECT 1 FROM riddle_bank b WHERE b.legacy_riddle_id = r.id
  )
`;

const SQL_COPY_RIDDLE_TAGS = `
  INSERT IGNORE INTO riddle_marathon_tags (riddle_id, marathon_id)
  SELECT b.id, r.marathon_id
  FROM riddle_bank b
  INNER JOIN marathon_riddles r ON r.id = b.legacy_riddle_id
`;

/** Same tables as scripts/sql/046_riddle_bank.sql, for a process that has not migrated yet. */
async function ensureRiddleBank(connection: SqlConnection): Promise<void> {
  for (const sql of [SQL_RIDDLE_BANK, SQL_RIDDLE_OPTIONS, SQL_RIDDLE_TAGS]) {
    try {
      await connection.execute(sql, []);
    } catch (error) {
      if (isDuplicate(error)) continue;
      throw error;
    }
  }
  try {
    await connection.execute(SQL_COPY_RIDDLES, []);
    await connection.execute(SQL_COPY_RIDDLE_TAGS, []);
  } catch (error) {
    const errno = (error as { errno?: number }).errno;
    if (errno === 1146 || errno === 1062) return;
    throw error;
  }
}

/** Same tables as scripts/sql/047_marathon_message_timeline.sql. */
async function ensureMessageTimeline(connection: SqlConnection): Promise<void> {
  await connection.execute(
    `CREATE TABLE IF NOT EXISTS marathon_message_overrides (
      marathon_id INT NOT NULL,
      day_number TINYINT UNSIGNED NOT NULL,
      kind VARCHAR(32) NOT NULL,
      channel VARCHAR(16) NOT NULL,
      cancelled TINYINT(1) NOT NULL DEFAULT 0,
      send_at DATETIME NULL,
      body TEXT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (marathon_id, day_number, kind, channel),
      CONSTRAINT fk_marathon_message_override FOREIGN KEY (marathon_id)
        REFERENCES marathons (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    [],
  );
  await connection.execute(
    `CREATE TABLE IF NOT EXISTS marathon_message_jobs (
      id BIGINT NOT NULL AUTO_INCREMENT,
      marathon_id INT NOT NULL,
      user_id INT NOT NULL,
      day_number TINYINT UNSIGNED NOT NULL,
      kind VARCHAR(32) NOT NULL,
      channel VARCHAR(16) NOT NULL,
      body TEXT NOT NULL,
      send_at DATETIME NOT NULL,
      status ENUM('queued','sending','sent','failed','cancelled') NOT NULL DEFAULT 'queued',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_marathon_message_job_due (status, send_at),
      KEY idx_marathon_message_job_slot (marathon_id, day_number, kind, channel),
      CONSTRAINT fk_marathon_message_job FOREIGN KEY (marathon_id)
        REFERENCES marathons (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
    [],
  );
  const notifyColumns = await columnNames(connection, "marathon_notifications");
  if (notifyColumns.size > 0 && !notifyColumns.has("outcome")) {
    await addColumn(connection, "marathon_notifications", "outcome", "VARCHAR(16) NULL AFTER delivered");
  }
  const outboxColumns = await columnNames(connection, "marathon_telegram_outbox");
  if (outboxColumns.size > 0 && !outboxColumns.has("marathon_id")) {
    await addColumn(connection, "marathon_telegram_outbox", "marathon_id", "INT NULL AFTER chat_id");
  }
  const notifyColumnsAfter = await columnNames(connection, "marathon_notifications");
  if (notifyColumnsAfter.has("kind")) {
    const kindRows = await connection.query<{ COLUMN_TYPE?: string; column_type?: string }>(
      `SELECT COLUMN_TYPE AS COLUMN_TYPE
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'marathon_notifications'
         AND COLUMN_NAME = 'kind'`,
      [],
    );
    const kindType = String(kindRows[0]?.COLUMN_TYPE ?? kindRows[0]?.column_type ?? "");
    if (kindType && !kindType.includes("'rank'")) {
      await connection.execute(
        `ALTER TABLE marathon_notifications
         MODIFY COLUMN kind ENUM('day_open','reminder','tomorrow','final','nudge','registered','rank') NOT NULL`,
        [],
      );
    }
  }
  if (outboxColumns.size > 0) {
    const statusRows = await connection.query<{ COLUMN_TYPE?: string; column_type?: string }>(
      `SELECT COLUMN_TYPE AS COLUMN_TYPE
       FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'marathon_telegram_outbox'
         AND COLUMN_NAME = 'status'`,
      [],
    );
    const statusType = String(statusRows[0]?.COLUMN_TYPE ?? statusRows[0]?.column_type ?? "");
    if (statusType && !statusType.includes("cancelled")) {
      await connection.execute(
        `ALTER TABLE marathon_telegram_outbox
         MODIFY COLUMN status ENUM('pending','sent','failed','cancelled') NOT NULL DEFAULT 'pending'`,
        [],
      );
    }
  }
  const notifyForError = await columnNames(connection, "marathon_notifications");
  if (notifyForError.size > 0 && !notifyForError.has("error_text")) {
    await addColumn(connection, "marathon_notifications", "error_text", "VARCHAR(500) NULL AFTER outcome");
  }
  const outboxForError = await columnNames(connection, "marathon_telegram_outbox");
  if (outboxForError.size > 0 && !outboxForError.has("error_text")) {
    await addColumn(connection, "marathon_telegram_outbox", "error_text", "VARCHAR(500) NULL");
  }
  if (outboxForError.size > 0 && !outboxForError.has("hold_reason")) {
    await addColumn(connection, "marathon_telegram_outbox", "hold_reason", "VARCHAR(16) NULL");
  }
  const jobColumns = await columnNames(connection, "marathon_message_jobs");
  if (jobColumns.size > 0 && !jobColumns.has("error_text")) {
    await addColumn(connection, "marathon_message_jobs", "error_text", "VARCHAR(500) NULL");
  }
  if (jobColumns.size > 0 && !jobColumns.has("hold_reason")) {
    await addColumn(connection, "marathon_message_jobs", "hold_reason", "VARCHAR(16) NULL");
  }
}

async function promoteMarathonCabinets(connection: SqlConnection): Promise<void> {
  try {
    await connection.execute(
      `UPDATE app_users
       SET cabinet_scope = 'full'
       WHERE cabinet_scope = 'marathon'`,
      [],
    );
  } catch (error) {
    const errno = (error as { errno?: number }).errno;
    if (errno === 1146 || errno === 1054) return;
    throw error;
  }
}

