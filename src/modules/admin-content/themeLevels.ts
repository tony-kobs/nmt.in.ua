import type { SqlConnection } from "@/lib/db/mysql";
import { publishedQuizTaskSql } from "@/lib/publishedQuizTask";
import { readStoredRule } from "@/modules/testing/themeLevelMatch";
import {
  AdminContentError,
  MAX_THEME_LEVELS,
  MAX_THEME_PARAM_INT,
  type ThemeLevel,
  type ThemeLevelInput,
  type ThemeLevelRule,
  type ThemeLevelRuleDraft,
  type ThemeLevelUpdate,
  type ThemeParamValueType,
  type ThemeTaskMark,
} from "./types";

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

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

const SQL_TASK_IDS = `
  SELECT id, theme_id
  FROM quiz_tasks
  WHERE ${publishedQuizTaskSql()}
  ORDER BY theme_id ASC, id ASC
`;

const SQL_MARKS = `
  SELECT task_id, param_id, int_value
  FROM quiz_task_params
`;

const SQL_LOCK_THEME = `SELECT id FROM themes WHERE id = ? LIMIT 1 FOR UPDATE`;

const SQL_COUNT_LEVELS = `
  SELECT COUNT(*) AS total, COALESCE(MAX(sort), -1) AS max_sort
  FROM theme_levels
  WHERE theme_id = ?
`;

const SQL_INSERT_LEVEL = `
  INSERT INTO theme_levels (theme_id, name, sort)
  VALUES (?, ?, ?)
`;

const SQL_INSERT_RULE = `
  INSERT INTO theme_level_rules (level_id, param_id, bool_value, int_min, int_max)
  VALUES (?, ?, ?, ?, ?)
`;

const SQL_LOCK_LEVEL = `
  SELECT id
  FROM theme_levels
  WHERE id = ? AND theme_id = ?
  FOR UPDATE
`;

const SQL_UPDATE_LEVEL = `
  UPDATE theme_levels
  SET name = ?
  WHERE id = ? AND theme_id = ?
`;

const SQL_DELETE_RULES = `DELETE FROM theme_level_rules WHERE level_id = ?`;

const SQL_LOCK_THEME_LEVELS = `
  SELECT id
  FROM theme_levels
  WHERE theme_id = ?
  ORDER BY sort ASC, id ASC
  FOR UPDATE
`;

const SQL_SET_SORT = `
  UPDATE theme_levels
  SET sort = ?
  WHERE id = ? AND theme_id = ?
`;

const SQL_DELETE_LEVEL = `DELETE FROM theme_levels WHERE id = ? AND theme_id = ?`;

const SQL_PARAMS_FOR_THEME = `
  SELECT id, value_type
  FROM theme_params
  WHERE theme_id = ?
  ORDER BY sort ASC, id ASC
  FOR UPDATE
`;

type LevelRow = {
  id: number;
  theme_id: number;
  name: string;
  sort: number;
};

type RuleRow = {
  level_id: number | string;
  param_id: number | string;
  value_type: string;
  bool_value: number | string | null;
  int_min: number | string | null;
  int_max: number | string | null;
};

function readValueType(value: unknown): ThemeParamValueType {
  if (value === "bool" || value === "int") return value;
  throw new AdminContentError("Corrupt theme param.", "db_error");
}

function normalizeRules(
  drafts: readonly ThemeLevelRuleDraft[],
  params: readonly { id: number; valueType: ThemeParamValueType }[],
): ThemeLevelRule[] {
  const byId = new Map(params.map((param) => [param.id, param]));
  const seen = new Set<number>();
  const rules: ThemeLevelRule[] = [];
  for (const draft of drafts) {
    if (!Number.isInteger(draft.paramId) || draft.paramId <= 0) {
      throw new AdminContentError("Invalid rule.", "invalid_input");
    }
    if (seen.has(draft.paramId)) {
      throw new AdminContentError("Invalid rule.", "invalid_input");
    }
    const param = byId.get(draft.paramId);
    if (!param) {
      throw new AdminContentError("Invalid rule.", "invalid_input");
    }
    seen.add(draft.paramId);
    if (param.valueType === "bool") {
      if (draft.boolValue !== 0 && draft.boolValue !== 1) {
        throw new AdminContentError("Invalid rule.", "invalid_input");
      }
      rules.push({
        paramId: draft.paramId,
        valueType: "bool",
        boolValue: draft.boolValue,
        intMin: null,
        intMax: null,
      });
      continue;
    }
    const { intMin, intMax } = draft;
    if (
      intMin == null ||
      intMax == null ||
      !Number.isInteger(intMin) ||
      !Number.isInteger(intMax) ||
      intMin < 0 ||
      intMax < intMin ||
      intMax > MAX_THEME_PARAM_INT
    ) {
      throw new AdminContentError("Invalid rule.", "invalid_input");
    }
    rules.push({
      paramId: draft.paramId,
      valueType: "int",
      boolValue: null,
      intMin,
      intMax,
    });
  }
  if (rules.length === 0) {
    throw new AdminContentError("A level needs a rule.", "rules_required");
  }
  return rules;
}

async function withLevelTransaction<T>(
  deps: { getConnection: () => Promise<SqlConnection> },
  work: (connection: SqlConnection) => Promise<T>,
): Promise<T> {
  const connection = await deps.getConnection();
  try {
    await connection.beginTransaction();
    const value = await work(connection);
    await connection.commit();
    return value;
  } catch (error) {
    try {
      await connection.rollback();
    } catch {
      // The connection may already be rolled back.
    }
    if (error instanceof AdminContentError) throw error;
    console.error("theme level: unexpected database error", error);
    throw new AdminContentError("Database operation failed.", "db_error");
  } finally {
    connection.release();
  }
}

async function insertRules(
  connection: SqlConnection,
  levelId: number,
  rules: readonly ThemeLevelRule[],
): Promise<void> {
  for (const rule of rules) {
    await connection.execute(SQL_INSERT_RULE, [
      levelId,
      rule.paramId,
      rule.boolValue,
      rule.intMin,
      rule.intMax,
    ]);
  }
}

export async function loadThemeLevels(
  connection: SqlConnection,
): Promise<ThemeLevel[]> {
  const levels = await connection.query<LevelRow>(SQL_LEVELS, []);
  const ruleRows = await connection.query<RuleRow>(SQL_RULES, []);
  const byLevel = new Map<number, ThemeLevelRule[]>();
  for (const row of ruleRows) {
    const levelId = Number(row.level_id);
    const rule = readStoredRule(row);
    if (!Number.isInteger(levelId) || levelId <= 0 || !rule) continue;
    const list = byLevel.get(levelId);
    if (list) list.push(rule);
    else byLevel.set(levelId, [rule]);
  }
  return levels.map((row) => ({
    id: Number(row.id),
    themeId: Number(row.theme_id),
    name: row.name.trim(),
    sort: Number(row.sort),
    rules: byLevel.get(Number(row.id)) ?? [],
  }));
}

export async function loadThemeTaskInventory(
  connection: SqlConnection,
): Promise<{ taskIdsByTheme: Map<number, number[]>; marks: ThemeTaskMark[] }> {
  const tasks = await connection.query<{
    id: number | string;
    theme_id: number | string;
  }>(SQL_TASK_IDS, []);
  const taskIdsByTheme = new Map<number, number[]>();
  for (const row of tasks) {
    const themeId = Number(row.theme_id);
    const taskId = Number(row.id);
    if (!Number.isInteger(themeId) || !Number.isInteger(taskId) || taskId <= 0) {
      continue;
    }
    const list = taskIdsByTheme.get(themeId);
    if (list) list.push(taskId);
    else taskIdsByTheme.set(themeId, [taskId]);
  }
  const markRows = await connection.query<{
    task_id: number | string;
    param_id: number | string;
    int_value: number | string;
  }>(SQL_MARKS, []);
  const marks: ThemeTaskMark[] = [];
  for (const row of markRows) {
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
  return { taskIdsByTheme, marks };
}

export async function createThemeLevel(
  input: ThemeLevelInput,
  deps: { getConnection: () => Promise<SqlConnection> } = {
    getConnection: loadDefaultConnection,
  },
): Promise<ThemeLevel> {
  return withLevelTransaction(deps, async (connection) => {
    const themes = await connection.query<{ id: number }>(SQL_LOCK_THEME, [
      input.themeId,
    ]);
    if (!themes[0]) {
      throw new AdminContentError("Theme not found.", "theme_not_found");
    }
    const paramRows = await connection.query<{ id: number; value_type: string }>(
      SQL_PARAMS_FOR_THEME,
      [input.themeId],
    );
    const rules = normalizeRules(
      input.rules,
      paramRows.map((row) => ({
        id: Number(row.id),
        valueType: readValueType(row.value_type),
      })),
    );
    const counts = await connection.query<{
      total: number | string;
      max_sort: number | string;
    }>(SQL_COUNT_LEVELS, [input.themeId]);
    const total = Number(counts[0]?.total ?? 0);
    const maxSort = Number(counts[0]?.max_sort ?? -1);
    if (total >= MAX_THEME_LEVELS) {
      throw new AdminContentError("Too many levels.", "invalid_input");
    }
    const sort = Number.isInteger(maxSort) ? maxSort + 1 : total;
    const result = await connection.execute(SQL_INSERT_LEVEL, [
      input.themeId,
      input.name,
      sort,
    ]);
    const id = Number(result.insertId);
    if (!Number.isInteger(id) || id <= 0) {
      throw new AdminContentError("Could not allocate level id.", "db_error");
    }
    await insertRules(connection, id, rules);
    return {
      id,
      themeId: input.themeId,
      name: input.name,
      sort,
      rules,
    };
  });
}

export async function updateThemeLevel(
  input: ThemeLevelUpdate,
  deps: { getConnection: () => Promise<SqlConnection> } = {
    getConnection: loadDefaultConnection,
  },
): Promise<ThemeLevel> {
  return withLevelTransaction(deps, async (connection) => {
    const locked = await connection.query<{ id: number }>(SQL_LOCK_LEVEL, [
      input.levelId,
      input.themeId,
    ]);
    if (!locked[0]) {
      throw new AdminContentError("Level not found.", "not_found");
    }
    const paramRows = await connection.query<{ id: number; value_type: string }>(
      SQL_PARAMS_FOR_THEME,
      [input.themeId],
    );
    const rules = normalizeRules(
      input.rules,
      paramRows.map((row) => ({
        id: Number(row.id),
        valueType: readValueType(row.value_type),
      })),
    );
    await connection.execute(SQL_UPDATE_LEVEL, [
      input.name,
      input.levelId,
      input.themeId,
    ]);
    await connection.execute(SQL_DELETE_RULES, [input.levelId]);
    await insertRules(connection, input.levelId, rules);
    return {
      id: input.levelId,
      themeId: input.themeId,
      name: input.name,
      sort: 0,
      rules,
    };
  });
}

export async function moveThemeLevel(
  themeId: number,
  levelId: number,
  direction: "up" | "down",
  deps: { getConnection: () => Promise<SqlConnection> } = {
    getConnection: loadDefaultConnection,
  },
): Promise<void> {
  if (direction !== "up" && direction !== "down") {
    throw new AdminContentError("Invalid direction.", "invalid_input");
  }
  await withLevelTransaction(deps, async (connection) => {
    const rows = await connection.query<{ id: number }>(SQL_LOCK_THEME_LEVELS, [
      themeId,
    ]);
    const ids = rows.map((row) => Number(row.id));
    const index = ids.indexOf(levelId);
    if (index < 0) {
      throw new AdminContentError("Level not found.", "not_found");
    }
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= ids.length) return;
    const next = ids.slice();
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved!);
    for (let sort = 0; sort < next.length; sort += 1) {
      await connection.execute(SQL_SET_SORT, [sort, next[sort], themeId]);
    }
  });
}

/** Removes the level and its rules. Assignments that pointed here keep their tasks. */
export async function deleteThemeLevel(
  themeId: number,
  levelId: number,
  deps: { getConnection: () => Promise<SqlConnection> } = {
    getConnection: loadDefaultConnection,
  },
): Promise<void> {
  await withLevelTransaction(deps, async (connection) => {
    const locked = await connection.query<{ id: number }>(SQL_LOCK_LEVEL, [
      levelId,
      themeId,
    ]);
    if (!locked[0]) {
      throw new AdminContentError("Level not found.", "not_found");
    }
    await connection.execute(SQL_DELETE_RULES, [levelId]);
    const result = await connection.execute(SQL_DELETE_LEVEL, [levelId, themeId]);
    if (result.affectedRows === 0) {
      throw new AdminContentError("Level not found.", "not_found");
    }
  });
}
