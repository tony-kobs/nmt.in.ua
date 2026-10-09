import type { SqlConnection } from "@/lib/db/mysql";

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
    kind ENUM('day_open', 'reminder', 'tomorrow', 'final') NOT NULL,
    channel ENUM('email', 'telegram') NOT NULL,
    sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (marathon_id, user_id, day_number, kind, channel)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS marathon_copy (
    marathon_id INT NOT NULL,
    copy_key VARCHAR(64) NOT NULL,
    body TEXT NOT NULL,
    PRIMARY KEY (marathon_id, copy_key),
    CONSTRAINT fk_marathon_copy FOREIGN KEY (marathon_id) REFERENCES marathons (id) ON DELETE CASCADE
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
  ["subject", "VARCHAR(64) NOT NULL DEFAULT 'math' AFTER title"],
  ["start_date", "CHAR(10) NULL AFTER subject"],
  ["unlock_hour", "CHAR(5) NOT NULL DEFAULT '09:00' AFTER start_date"],
  ["days_count", "TINYINT UNSIGNED NOT NULL DEFAULT 5 AFTER unlock_hour"],
  ["pass_threshold", "TINYINT UNSIGNED NOT NULL DEFAULT 60 AFTER days_count"],
  ["final_cta_text", "VARCHAR(500) NULL AFTER pass_threshold"],
  ["final_cta_url", "VARCHAR(500) NULL AFTER final_cta_text"],
  ["intro_video_url", "VARCHAR(500) NULL AFTER final_cta_url"],
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
    if (kindType && !kindType.includes("tomorrow")) {
      await connection.execute(
        `ALTER TABLE marathon_notifications
         MODIFY COLUMN kind ENUM('day_open','reminder','tomorrow','final') NOT NULL`,
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

  const userColumns = await columnNames(connection, "app_users");
  if (userColumns.size > 0 && !userColumns.has("cabinet_scope")) {
    await addColumn(
      connection,
      "app_users",
      "cabinet_scope",
      "ENUM('full','marathon') NOT NULL DEFAULT 'full' AFTER role",
    );
    await backfillMarathonCabinet(connection);
  }
}

/**
 * Accounts created by the marathon form before `cabinet_scope` existed have
 * no other signal than "daily participant, no converted_at, no topic sessions".
 * A platform student who joined and already has sessions stays `full`.
 * An admin can open the cabinet for anyone the heuristic caught.
 */
async function backfillMarathonCabinet(connection: SqlConnection): Promise<void> {
  try {
    await connection.execute(
      `UPDATE app_users u
       SET u.cabinet_scope = 'marathon'
       WHERE u.role = 'student'
         AND u.cabinet_scope = 'full'
         AND EXISTS (
           SELECT 1 FROM marathon_participants p
           INNER JOIN marathons m ON m.id = p.marathon_id
           WHERE p.user_id = u.id AND m.kind = 'daily'
         )
         AND NOT EXISTS (
           SELECT 1 FROM marathon_participants p
           WHERE p.user_id = u.id AND p.converted_at IS NOT NULL
         )
         AND NOT EXISTS (
           SELECT 1 FROM task_sessions s WHERE s.user_id = u.id
         )`,
      [],
    );
  } catch (error) {
    const errno = (error as { errno?: number }).errno;
    if (errno === 1146 || errno === 1054) return;
    throw error;
  }
}
