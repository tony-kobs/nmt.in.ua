import type { SqlConnection } from "@/lib/db/mysql";
import {
  AdminContentError,
  MAX_THEME_PARAMS,
  type TaskParamDraft,
  type TaskParamValue,
  type ThemeParam,
  type ThemeParamInput,
  type ThemeParamUpdate,
  type ThemeParamValueType,
} from "./types";
import { normalizeTaskParamValues } from "./validate";

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

const SQL_ALL_PARAMS = `
  SELECT p.id, p.theme_id, p.code, p.name, p.value_type, p.sort,
    (SELECT COUNT(*) FROM quiz_task_params v WHERE v.param_id = p.id) AS usage_count
  FROM theme_params p
  ORDER BY p.theme_id ASC, p.sort ASC, p.id ASC
`;

const SQL_LOCK_THEME = `SELECT id FROM themes WHERE id = ? LIMIT 1 FOR UPDATE`;

const SQL_COUNT_PARAMS = `
  SELECT COUNT(*) AS total, COALESCE(MAX(sort), -1) AS max_sort
  FROM theme_params
  WHERE theme_id = ?
`;

const SQL_INSERT_PARAM = `
  INSERT INTO theme_params (theme_id, code, name, value_type, sort)
  VALUES (?, ?, ?, ?, ?)
`;

const SQL_LOCK_PARAM = `
  SELECT p.id, p.value_type,
    (SELECT COUNT(*) FROM quiz_task_params v WHERE v.param_id = p.id) AS usage_count
  FROM theme_params p
  WHERE p.id = ? AND p.theme_id = ?
  FOR UPDATE
`;

const SQL_UPDATE_PARAM = `
  UPDATE theme_params
  SET name = ?, code = ?, value_type = ?
  WHERE id = ? AND theme_id = ?
`;

const SQL_LOCK_THEME_PARAMS = `
  SELECT id
  FROM theme_params
  WHERE theme_id = ?
  ORDER BY sort ASC, id ASC
  FOR UPDATE
`;

const SQL_SET_SORT = `
  UPDATE theme_params
  SET sort = ?
  WHERE id = ? AND theme_id = ?
`;

const SQL_LOCK_PARAM_USAGE = `
  SELECT p.id,
    (SELECT COUNT(*) FROM quiz_task_params v WHERE v.param_id = p.id) AS usage_count
  FROM theme_params p
  WHERE p.id = ? AND p.theme_id = ?
  FOR UPDATE
`;

const SQL_DELETE_PARAM_VALUES = `DELETE FROM quiz_task_params WHERE param_id = ?`;

const SQL_DELETE_PARAM = `DELETE FROM theme_params WHERE id = ? AND theme_id = ?`;

const SQL_PARAMS_FOR_THEME = `
  SELECT id, value_type
  FROM theme_params
  WHERE theme_id = ?
  ORDER BY sort ASC, id ASC
`;

const SQL_DELETE_TASK_VALUES = `DELETE FROM quiz_task_params WHERE task_id = ?`;

const SQL_INSERT_TASK_VALUE = `
  INSERT INTO quiz_task_params (task_id, param_id, int_value)
  VALUES (?, ?, ?)
`;

const SQL_TASK_VALUES = `
  SELECT param_id, int_value
  FROM quiz_task_params
  WHERE task_id = ?
  ORDER BY param_id ASC
`;

type ParamRow = {
  id: number;
  theme_id: number;
  code: string;
  name: string;
  value_type: string;
  sort: number;
  usage_count: number | string;
};

type UsageRow = {
  id: number;
  value_type?: string;
  usage_count: number | string;
};

function readValueType(value: unknown): ThemeParamValueType {
  if (value === "bool" || value === "int") return value;
  throw new AdminContentError("Corrupt theme param.", "db_error");
}

function mapParam(row: ParamRow): ThemeParam {
  return {
    id: Number(row.id),
    themeId: Number(row.theme_id),
    code: row.code.trim(),
    name: row.name.trim(),
    valueType: readValueType(row.value_type),
    sort: Number(row.sort),
    usageCount: Number(row.usage_count),
  };
}

function isDuplicateKey(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "errno" in error &&
    Number((error as { errno?: number }).errno) === 1062
  );
}

async function withThemeParamTransaction<T>(
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
    if (isDuplicateKey(error)) {
      throw new AdminContentError("Param code already exists.", "code_taken");
    }
    console.error("theme param: unexpected database error", error);
    throw new AdminContentError("Database operation failed.", "db_error");
  } finally {
    connection.release();
  }
}

export async function loadThemeParams(
  connection: SqlConnection,
): Promise<ThemeParam[]> {
  const rows = await connection.query<ParamRow>(SQL_ALL_PARAMS, []);
  return rows.map(mapParam);
}

export async function loadTaskParamValues(
  connection: SqlConnection,
  taskId: number,
): Promise<TaskParamValue[]> {
  const rows = await connection.query<{
    param_id: number | string;
    int_value: number | string;
  }>(SQL_TASK_VALUES, [taskId]);
  return rows.map((row) => ({
    paramId: Number(row.param_id),
    intValue: Number(row.int_value),
  }));
}

/**
 * Replaces every stored mark on the task with values for its current theme.
 * A parameter from another theme is rejected before the old rows are removed.
 */
export async function replaceQuizTaskParams(
  connection: SqlConnection,
  taskId: number,
  themeId: number,
  drafts: readonly TaskParamDraft[],
): Promise<TaskParamValue[]> {
  const rows = await connection.query<{ id: number; value_type: string }>(
    SQL_PARAMS_FOR_THEME,
    [themeId],
  );
  const saved = normalizeTaskParamValues(
    drafts,
    rows.map((row) => ({
      id: Number(row.id),
      valueType: readValueType(row.value_type),
    })),
  );
  await connection.execute(SQL_DELETE_TASK_VALUES, [taskId]);
  for (const value of saved) {
    await connection.execute(SQL_INSERT_TASK_VALUE, [
      taskId,
      value.paramId,
      value.intValue,
    ]);
  }
  return saved;
}

export async function createThemeParam(
  input: ThemeParamInput,
  deps: { getConnection: () => Promise<SqlConnection> } = {
    getConnection: loadDefaultConnection,
  },
): Promise<ThemeParam> {
  return withThemeParamTransaction(deps, async (connection) => {
    const themes = await connection.query<{ id: number }>(SQL_LOCK_THEME, [
      input.themeId,
    ]);
    if (!themes[0]) {
      throw new AdminContentError("Theme not found.", "theme_not_found");
    }
    const counts = await connection.query<{
      total: number | string;
      max_sort: number | string;
    }>(SQL_COUNT_PARAMS, [input.themeId]);
    const total = Number(counts[0]?.total ?? 0);
    const maxSort = Number(counts[0]?.max_sort ?? -1);
    if (total >= MAX_THEME_PARAMS) {
      throw new AdminContentError("Too many params.", "invalid_input");
    }
    const sort = Number.isInteger(maxSort) ? maxSort + 1 : total;
    const result = await connection.execute(SQL_INSERT_PARAM, [
      input.themeId,
      input.code,
      input.name,
      input.valueType,
      sort,
    ]);
    const id = Number(result.insertId);
    if (!Number.isInteger(id) || id <= 0) {
      throw new AdminContentError("Could not allocate param id.", "db_error");
    }
    return {
      id,
      themeId: input.themeId,
      code: input.code,
      name: input.name,
      valueType: input.valueType,
      sort,
      usageCount: 0,
    };
  });
}

export async function updateThemeParam(
  input: ThemeParamUpdate,
  deps: { getConnection: () => Promise<SqlConnection> } = {
    getConnection: loadDefaultConnection,
  },
): Promise<ThemeParam> {
  return withThemeParamTransaction(deps, async (connection) => {
    const rows = await connection.query<UsageRow>(SQL_LOCK_PARAM, [
      input.paramId,
      input.themeId,
    ]);
    const current = rows[0];
    if (!current) {
      throw new AdminContentError("Param not found.", "not_found");
    }
    const usageCount = Number(current.usage_count);
    const currentType = readValueType(current.value_type);
    if (input.valueType !== currentType && usageCount > 0) {
      throw new AdminContentError("Param type is in use.", "type_locked");
    }
    await connection.execute(SQL_UPDATE_PARAM, [
      input.name,
      input.code,
      input.valueType,
      input.paramId,
      input.themeId,
    ]);
    return {
      id: input.paramId,
      themeId: input.themeId,
      code: input.code,
      name: input.name,
      valueType: input.valueType,
      sort: 0,
      usageCount,
    };
  });
}

export async function moveThemeParam(
  themeId: number,
  paramId: number,
  direction: "up" | "down",
  deps: { getConnection: () => Promise<SqlConnection> } = {
    getConnection: loadDefaultConnection,
  },
): Promise<void> {
  if (direction !== "up" && direction !== "down") {
    throw new AdminContentError("Invalid direction.", "invalid_input");
  }
  await withThemeParamTransaction(deps, async (connection) => {
    const rows = await connection.query<{ id: number }>(SQL_LOCK_THEME_PARAMS, [
      themeId,
    ]);
    const ids = rows.map((row) => Number(row.id));
    const index = ids.indexOf(paramId);
    if (index < 0) {
      throw new AdminContentError("Param not found.", "not_found");
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

/** Removes the parameter and every value tasks stored for it. */
export async function deleteThemeParam(
  themeId: number,
  paramId: number,
  deps: { getConnection: () => Promise<SqlConnection> } = {
    getConnection: loadDefaultConnection,
  },
): Promise<{ usageCount: number }> {
  return withThemeParamTransaction(deps, async (connection) => {
    const rows = await connection.query<UsageRow>(SQL_LOCK_PARAM_USAGE, [
      paramId,
      themeId,
    ]);
    const current = rows[0];
    if (!current) {
      throw new AdminContentError("Param not found.", "not_found");
    }
    const usageCount = Number(current.usage_count);
    await connection.execute(SQL_DELETE_PARAM_VALUES, [paramId]);
    const result = await connection.execute(SQL_DELETE_PARAM, [paramId, themeId]);
    if (result.affectedRows === 0) {
      throw new AdminContentError("Param not found.", "not_found");
    }
    return { usageCount };
  });
}
