import "server-only";

import catalog from "@/content/workbookProblems.json";
import type { SqlConnection } from "@/lib/db/mysql";
import { ensureProblemsSchema } from "./workbookSchema";

export type WorkbookTheme = {
  id: number;
  name: string;
  ord: number;
  taskCount: number;
};

export type WorkbookProblem = {
  id: number;
  problemText: string;
  answers: [string, string, string, string];
  rightAnswerN: 1 | 2 | 3 | 4;
};

type GetProblemsDeps = {
  getConnection: () => Promise<SqlConnection>;
  seedIfEmpty?: boolean;
};

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

function asAnswerN(value: number): 1 | 2 | 3 | 4 {
  if (value === 1 || value === 2 || value === 3 || value === 4) return value;
  return 1;
}

/**
 * Printable workbook labels and tasks come from the zadachnyk catalog,
 * not from trainer `themes` / `quiz_tasks`. Those tables use different ids.
 */
export function listWorkbookThemesFromCatalog(): WorkbookTheme[] {
  return catalog.themes.map((theme) => ({
    id: theme.id,
    name: theme.name,
    ord: theme.id,
    taskCount: catalog.problems.filter((row) => row.theme_id === theme.id)
      .length,
  }));
}

export function listWorkbookProblemsFromCatalog(
  themeId: number,
): WorkbookProblem[] {
  return catalog.problems
    .filter((row) => row.theme_id === themeId)
    .map((row) => ({
      id: row.id,
      problemText: row.problem_text,
      answers: [row.answer_1, row.answer_2, row.answer_3, row.answer_4],
      rightAnswerN: asAnswerN(row.right_answer_n),
    }));
}

/** Themes that have at least one printable workbook task. */
export async function getWorkbookThemes(
  deps: GetProblemsDeps = {
    getConnection: loadDefaultConnection,
    seedIfEmpty: true,
  },
): Promise<WorkbookTheme[]> {
  await ensureProblemsSchema({
    getConnection: deps.getConnection,
    seedIfEmpty: deps.seedIfEmpty !== false,
  });
  return listWorkbookThemesFromCatalog();
}

/** All printable tasks for one theme, including the answer key. */
export async function getWorkbookProblems(
  themeId: number,
  deps: GetProblemsDeps = {
    getConnection: loadDefaultConnection,
    seedIfEmpty: true,
  },
): Promise<WorkbookProblem[]> {
  await ensureProblemsSchema({
    getConnection: deps.getConnection,
    seedIfEmpty: deps.seedIfEmpty !== false,
  });
  return listWorkbookProblemsFromCatalog(themeId);
}
