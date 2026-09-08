import "server-only";
import type { SqlConnection } from "@/lib/db/mysql";
import catalog from "@/content/workbookProblems.json";
import { SQL_CREATE_PROBLEMS } from "@/modules/content-import/schema";

const SQL_COUNT_PROBLEMS = "SELECT COUNT(*) AS n FROM problems";

const SQL_INSERT_PROBLEMS_PREFIX =
  "INSERT INTO problems (id, name, problem_text, theme_id, answer_1, answer_2, answer_3, answer_4, right_answer_n, comments, difficulty) VALUES ";

const SEED_CHUNK = 40;

type WorkbookSchemaDeps = {
  getConnection: () => Promise<SqlConnection>;
  seedIfEmpty?: boolean;
};

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

let schemaReady: Promise<void> | undefined;

async function seedProblemsIfEmpty(connection: SqlConnection): Promise<void> {
  const rows = await connection.query<{ n: number }>(SQL_COUNT_PROBLEMS);
  const count = Number(rows[0]?.n ?? 0);
  if (count > 0) return;

  const records = catalog.problems;
  for (let i = 0; i < records.length; i += SEED_CHUNK) {
    const chunk = records.slice(i, i + SEED_CHUNK);
    const placeholders = chunk.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
    const params = chunk.flatMap((row) => [
      row.id,
      row.name,
      row.problem_text,
      row.theme_id,
      row.answer_1,
      row.answer_2,
      row.answer_3,
      row.answer_4,
      row.right_answer_n,
      row.comments,
      row.difficulty,
    ]);
    await connection.execute(SQL_INSERT_PROBLEMS_PREFIX + placeholders, params);
  }
}

async function runWorkbookSchemaMigration(
  getConnection: () => Promise<SqlConnection>,
  seedIfEmpty: boolean,
): Promise<void> {
  const connection = await getConnection();
  try {
    await connection.execute(SQL_CREATE_PROBLEMS, []);
    if (seedIfEmpty) {
      await seedProblemsIfEmpty(connection);
    }
  } finally {
    connection.release();
  }
}

/** Creates `problems` once per process; seeds the print bank if the table is empty. */
export async function ensureProblemsSchema(
  deps: WorkbookSchemaDeps = {
    getConnection: loadDefaultConnection,
    seedIfEmpty: true,
  },
): Promise<void> {
  const seedIfEmpty = deps.seedIfEmpty !== false;
  const useMemo = deps.getConnection === loadDefaultConnection;

  if (!useMemo) {
    await runWorkbookSchemaMigration(deps.getConnection, seedIfEmpty);
    return;
  }

  if (!schemaReady) {
    schemaReady = runWorkbookSchemaMigration(
      deps.getConnection,
      seedIfEmpty,
    ).catch((error) => {
      schemaReady = undefined;
      throw error;
    });
  }
  await schemaReady;
}

/** Test helper: drop the memoized schema promise. */
export function resetProblemsSchemaMemo(): void {
  schemaReady = undefined;
}
