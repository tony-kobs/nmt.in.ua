import type { SqlConnection } from "@/lib/db/mysql";
import {
  matchingTaskIds,
  readStoredRule,
  type ThemeLevelRule,
  type ThemeTaskMark,
} from "./themeLevelMatch";

const SQL_LEVEL = `
  SELECT id
  FROM theme_levels
  WHERE id = ? AND theme_id = ?
  LIMIT 1
`;

const SQL_RULES = `
  SELECT r.param_id, p.value_type, r.bool_value, r.int_min, r.int_max
  FROM theme_level_rules r
  INNER JOIN theme_params p ON p.id = r.param_id
  WHERE r.level_id = ?
  ORDER BY r.id ASC
`;

const MARK_CHUNK = 400;

export class ThemeLevelPoolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ThemeLevelPoolError";
  }
}

export type NarrowedPool = {
  ids: number[];
  /**
   * True when a level was applied and no id in the pool matches it.
   * A missing value for a rule's parameter is a miss, so an empty result
   * is a level with no tasks, not a crash.
   */
  emptyLevel: boolean;
};

type RuleRow = {
  param_id: number | string;
  value_type: string;
  bool_value: number | string | null;
  int_min: number | string | null;
  int_max: number | string | null;
};

async function loadMarks(
  connection: SqlConnection,
  taskIds: readonly number[],
): Promise<ThemeTaskMark[]> {
  const marks: ThemeTaskMark[] = [];
  for (let offset = 0; offset < taskIds.length; offset += MARK_CHUNK) {
    const chunk = taskIds.slice(offset, offset + MARK_CHUNK);
    const placeholders = chunk.map(() => "?").join(", ");
    const rows = await connection.query<{
      task_id: number | string;
      param_id: number | string;
      int_value: number | string;
    }>(
      `SELECT task_id, param_id, int_value
       FROM quiz_task_params
       WHERE task_id IN (${placeholders})`,
      [...chunk],
    );
    for (const row of rows) {
      const taskId = Number(row.task_id);
      const paramId = Number(row.param_id);
      const intValue = Number(row.int_value);
      if (
        !Number.isInteger(taskId) ||
        !Number.isInteger(paramId) ||
        !Number.isInteger(intValue)
      ) {
        continue;
      }
      marks.push({ taskId, paramId, intValue });
    }
  }
  return marks;
}

/**
 * Keeps only the ids that match `levelId`.
 * When `levelId` is null or omitted, the ids are returned unchanged and
 * this function does not query: the hand-out stays exactly as it was.
 */
export async function narrowTaskIdsByLevel(
  connection: SqlConnection,
  themeId: number,
  taskIds: readonly number[],
  levelId: number | null | undefined,
): Promise<NarrowedPool> {
  if (levelId == null) {
    return { ids: [...taskIds], emptyLevel: false };
  }

  const levels = await connection.query<{ id: number }>(SQL_LEVEL, [
    levelId,
    themeId,
  ]);
  if (!levels[0]) {
    throw new ThemeLevelPoolError("Level does not belong to this theme.");
  }

  const rows = await connection.query<RuleRow>(SQL_RULES, [levelId]);
  const rules: ThemeLevelRule[] = [];
  for (const row of rows) {
    const rule = readStoredRule(row);
    if (!rule) {
      return { ids: [], emptyLevel: true };
    }
    rules.push(rule);
  }

  const ids = taskIds.filter((id) => Number.isInteger(id) && id > 0);
  if (rules.length === 0) {
    return { ids, emptyLevel: false };
  }
  if (ids.length === 0) {
    return { ids: [], emptyLevel: true };
  }

  const marks = await loadMarks(connection, ids);
  const matched = matchingTaskIds(ids, marks, rules);
  return { ids: matched, emptyLevel: matched.length === 0 };
}
