import type { SqlConnection } from "@/lib/db/mysql";
import { ContentImportError } from "./errors";
import { logSanitizedError } from "./logging";
import type {
  QuizTaskRecord,
  ThemeConnectionRecord,
  ThemeRecord,
} from "./validate";

export type ImportDatasets = {
  themes: ThemeRecord[];
  themeConnections: ThemeConnectionRecord[];
  quizTasks: QuizTaskRecord[];
};

export type DatasetCounts = {
  themes: number;
  themeConnections: number;
  quizTasks: number;
};

export type ImportSummary = {
  inserted: DatasetCounts;
  updated: DatasetCounts;
  totalInserted: number;
  totalUpdated: number;
};

/**
 * Table and column names below match the schema verified directly against
 * the team's MySQL database (see AGENTS.md / task description).
 */
const SQL_INSERT_THEMES_PREFIX =
  "INSERT INTO themes (id, name, description, ord) VALUES ";
const SQL_UPSERT_THEMES_SUFFIX =
  " ON DUPLICATE KEY UPDATE name = VALUES(name), description = VALUES(description), ord = VALUES(ord)";

const SQL_INSERT_THEME_CONNECTIONS_PREFIX =
  "INSERT INTO theme_connections (id, vertex_start, vertex_finish) VALUES ";
const SQL_UPSERT_THEME_CONNECTIONS_SUFFIX =
  " ON DUPLICATE KEY UPDATE vertex_start = VALUES(vertex_start), vertex_finish = VALUES(vertex_finish)";

const SQL_INSERT_QUIZ_TASKS_PREFIX =
  "INSERT INTO quiz_tasks (id, name, task_text, theme_id, answer_1, answer_2, answer_3, answer_4, right_answer_n, comments, difficulty) VALUES ";
const SQL_UPSERT_QUIZ_TASKS_SUFFIX =
  " ON DUPLICATE KEY UPDATE name = VALUES(name), task_text = VALUES(task_text), theme_id = VALUES(theme_id), answer_1 = VALUES(answer_1), answer_2 = VALUES(answer_2), answer_3 = VALUES(answer_3), answer_4 = VALUES(answer_4), right_answer_n = VALUES(right_answer_n), comments = VALUES(comments), difficulty = VALUES(difficulty)";

async function findExistingIds(
  connection: SqlConnection,
  table: "themes" | "theme_connections" | "quiz_tasks",
  ids: number[],
): Promise<Set<number>> {
  if (ids.length === 0) return new Set();
  const placeholders = ids.map(() => "?").join(", ");
  const rows = await connection.query<{ id: number }>(
    `SELECT id FROM ${table} WHERE id IN (${placeholders})`,
    ids,
  );
  return new Set(rows.map((row) => row.id));
}

function countInsertedUpdated(
  ids: number[],
  existingIds: Set<number>,
): { inserted: number; updated: number } {
  let inserted = 0;
  let updated = 0;
  for (const id of ids) {
    if (existingIds.has(id)) updated += 1;
    else inserted += 1;
  }
  return { inserted, updated };
}

async function upsertThemes(
  connection: SqlConnection,
  records: ThemeRecord[],
): Promise<{ inserted: number; updated: number }> {
  if (records.length === 0) return { inserted: 0, updated: 0 };

  const existingIds = await findExistingIds(
    connection,
    "themes",
    records.map((r) => r.id),
  );
  const placeholders = records.map(() => "(?, ?, ?, ?)").join(", ");
  const params = records.flatMap((r) => [r.id, r.name, r.description, r.ord]);
  await connection.execute(
    SQL_INSERT_THEMES_PREFIX + placeholders + SQL_UPSERT_THEMES_SUFFIX,
    params,
  );
  return countInsertedUpdated(
    records.map((r) => r.id),
    existingIds,
  );
}

async function upsertThemeConnections(
  connection: SqlConnection,
  records: ThemeConnectionRecord[],
): Promise<{ inserted: number; updated: number }> {
  if (records.length === 0) return { inserted: 0, updated: 0 };

  const existingIds = await findExistingIds(
    connection,
    "theme_connections",
    records.map((r) => r.id),
  );
  const placeholders = records.map(() => "(?, ?, ?)").join(", ");
  const params = records.flatMap((r) => [r.id, r.vertexStart, r.vertexFinish]);
  await connection.execute(
    SQL_INSERT_THEME_CONNECTIONS_PREFIX +
      placeholders +
      SQL_UPSERT_THEME_CONNECTIONS_SUFFIX,
    params,
  );
  return countInsertedUpdated(
    records.map((r) => r.id),
    existingIds,
  );
}

async function upsertQuizTasks(
  connection: SqlConnection,
  records: QuizTaskRecord[],
): Promise<{ inserted: number; updated: number }> {
  if (records.length === 0) return { inserted: 0, updated: 0 };

  const existingIds = await findExistingIds(
    connection,
    "quiz_tasks",
    records.map((r) => r.id),
  );
  const placeholders = records
    .map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .join(", ");
  const params = records.flatMap((r) => [
    r.id,
    r.name,
    r.taskText,
    r.themeId,
    r.answer1,
    r.answer2,
    r.answer3,
    r.answer4,
    r.rightAnswerN,
    r.comments,
    r.difficulty,
  ]);
  await connection.execute(
    SQL_INSERT_QUIZ_TASKS_PREFIX + placeholders + SQL_UPSERT_QUIZ_TASKS_SUFFIX,
    params,
  );
  return countInsertedUpdated(
    records.map((r) => r.id),
    existingIds,
  );
}

/** Validates cross-dataset foreign-key references against the live `themes` table. */
async function checkThemeReferences(
  connection: SqlConnection,
  datasets: ImportDatasets,
): Promise<void> {
  const referencedIds = new Set<number>();
  for (const c of datasets.themeConnections) {
    referencedIds.add(c.vertexStart);
    referencedIds.add(c.vertexFinish);
  }
  for (const t of datasets.quizTasks) {
    referencedIds.add(t.themeId);
  }
  if (referencedIds.size === 0) return;

  const existingIds = await findExistingIds(connection, "themes", [
    ...referencedIds,
  ]);
  const missing = [...referencedIds].filter((id) => !existingIds.has(id));
  if (missing.length > 0) {
    throw new ContentImportError("validation", [
      `Referenced theme id(s) not found (imported or existing): ${missing.sort((a, b) => a - b).join(", ")}`,
    ]);
  }
}

type ImportToDatabaseDeps = {
  getConnection: () => Promise<SqlConnection>;
};

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

/**
 * Persists all three datasets in a single transaction, in dependency order
 * (themes, then theme_connections, then quiz_tasks). Any validation or SQL
 * failure rolls back the entire import — no partial writes survive.
 */
export async function importToDatabase(
  datasets: ImportDatasets,
  deps: ImportToDatabaseDeps = { getConnection: loadDefaultConnection },
): Promise<ImportSummary> {
  const connection = await deps.getConnection();
  try {
    await connection.beginTransaction();
    try {
      const themes = await upsertThemes(connection, datasets.themes);
      await checkThemeReferences(connection, datasets);
      const themeConnections = await upsertThemeConnections(
        connection,
        datasets.themeConnections,
      );
      const quizTasks = await upsertQuizTasks(connection, datasets.quizTasks);

      await connection.commit();

      const inserted: DatasetCounts = {
        themes: themes.inserted,
        themeConnections: themeConnections.inserted,
        quizTasks: quizTasks.inserted,
      };
      const updated: DatasetCounts = {
        themes: themes.updated,
        themeConnections: themeConnections.updated,
        quizTasks: quizTasks.updated,
      };
      return {
        inserted,
        updated,
        totalInserted:
          inserted.themes + inserted.themeConnections + inserted.quizTasks,
        totalUpdated:
          updated.themes + updated.themeConnections + updated.quizTasks,
      };
    } catch (error) {
      await connection.rollback().catch(() => undefined);
      throw error;
    }
  } catch (error) {
    if (error instanceof ContentImportError) throw error;
    logSanitizedError("content_import.db", error);
    throw new ContentImportError("server", ["Database operation failed."]);
  } finally {
    connection.release();
  }
}
