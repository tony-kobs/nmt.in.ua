import { publishedQuizTaskSql } from "@/lib/publishedQuizTask";
import type { SqlConnection } from "@/lib/db/mysql";
import {
  countMatchingTasks,
  readStoredRule,
  type ThemeLevelRule,
  type ThemeTaskMark,
} from "./themeLevelMatch";
import type { ThemeLevelChoice } from "./types";

const SQL_LEVELS = `
  SELECT id, theme_id, name, sort
  FROM theme_levels
  ORDER BY theme_id ASC, sort ASC, id ASC
`;

const SQL_RULES = `
  SELECT r.level_id, r.param_id, p.value_type, r.bool_value, r.int_min, r.int_max
  FROM theme_level_rules r
  INNER JOIN theme_params p ON p.id = r.param_id
  ORDER BY r.level_id ASC, r.id ASC
`;

type LevelRow = {
  id: number | string;
  theme_id: number | string;
  name: string;
  sort: number | string;
};

type RuleRow = {
  level_id: number | string;
  param_id: number | string;
  value_type: string;
  bool_value: number | string | null;
  int_min: number | string | null;
  int_max: number | string | null;
};

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

async function loadMarks(
  connection: SqlConnection,
  taskIds: readonly number[],
): Promise<ThemeTaskMark[]> {
  if (taskIds.length === 0) return [];
  const placeholders = taskIds.map(() => "?").join(", ");
  const rows = await connection.query<{
    task_id: number | string;
    param_id: number | string;
    int_value: number | string;
  }>(
    `SELECT task_id, param_id, int_value
     FROM quiz_task_params
     WHERE task_id IN (${placeholders})`,
    [...taskIds],
  );
  const marks: ThemeTaskMark[] = [];
  for (const row of rows) {
    const taskId = Number(row.task_id);
    const paramId = Number(row.param_id);
    const intValue = Number(row.int_value);
    if (
      Number.isInteger(taskId) &&
      Number.isInteger(paramId) &&
      Number.isInteger(intValue)
    ) {
      marks.push({ taskId, paramId, intValue });
    }
  }
  return marks;
}

/**
 * Levels grouped for the start screen and quick assign. Themes with no
 * levels produce nothing, so those screens stay as they are today.
 */
export async function listThemeLevelChoices(
  deps: { getConnection: () => Promise<SqlConnection> } = {
    getConnection: loadDefaultConnection,
  },
): Promise<ThemeLevelChoice[]> {
  const connection = await deps.getConnection();
  try {
    const levels = await connection.query<LevelRow>(SQL_LEVELS, []);
    if (levels.length === 0) return [];
    const ruleRows = await connection.query<RuleRow>(SQL_RULES, []);
    const rulesByLevel = new Map<number, ThemeLevelRule[]>();
    for (const row of ruleRows) {
      const levelId = Number(row.level_id);
      const rule = readStoredRule(row);
      if (!Number.isInteger(levelId) || levelId <= 0 || !rule) continue;
      const list = rulesByLevel.get(levelId);
      if (list) list.push(rule);
      else rulesByLevel.set(levelId, [rule]);
    }

    const themeIds = [
      ...new Set(
        levels
          .map((row) => Number(row.theme_id))
          .filter((id) => Number.isInteger(id) && id > 0),
      ),
    ];
    const themeMarks = themeIds.map(() => "?").join(", ");
    const tasks = await connection.query<{
      id: number | string;
      theme_id: number | string;
    }>(
      `SELECT id, theme_id FROM quiz_tasks WHERE theme_id IN (${themeMarks}) AND ${publishedQuizTaskSql()}`,
      themeIds,
    );
    const taskIdsByTheme = new Map<number, number[]>();
    const allTaskIds: number[] = [];
    for (const row of tasks) {
      const themeId = Number(row.theme_id);
      const taskId = Number(row.id);
      if (!Number.isInteger(taskId) || taskId <= 0) continue;
      allTaskIds.push(taskId);
      const list = taskIdsByTheme.get(themeId);
      if (list) list.push(taskId);
      else taskIdsByTheme.set(themeId, [taskId]);
    }
    const marks = await loadMarks(connection, allTaskIds);

    return levels.flatMap((row) => {
      const id = Number(row.id);
      const themeId = Number(row.theme_id);
      if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(themeId)) {
        return [];
      }
      const taskIds = taskIdsByTheme.get(themeId) ?? [];
      const rules = rulesByLevel.get(id) ?? [];
      return [
        {
          id,
          themeId,
          name: row.name.trim(),
          sort: Number(row.sort),
          matchCount: countMatchingTasks(taskIds, marks, rules),
        },
      ];
    });
  } finally {
    connection.release();
  }
}
