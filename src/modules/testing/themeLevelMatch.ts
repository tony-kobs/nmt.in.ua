/**
 * A level is a set of rules over one theme's parameters.
 *
 * A task matches only when every rule matches:
 * - bool: the stored `quiz_task_params.int_value` is exactly 0 or 1, as the rule says;
 * - int: the stored value lies in [min, max], inclusive.
 *
 * A task that has no row for a rule's parameter does not match.
 * An empty rule list matches every task: nothing was asked of it.
 * Callers that save a level refuse an empty list, so a saved level narrows.
 */

export const THEME_LEVEL_INT_MAX = 2_147_483_647;

export type ThemeLevelRule = {
  paramId: number;
  valueType: "bool" | "int";
  /** 0 or 1 when `valueType` is bool. Null for an int rule. */
  boolValue: 0 | 1 | null;
  /** Inclusive bounds when `valueType` is int. Null for a bool rule. */
  intMin: number | null;
  intMax: number | null;
};

export type ThemeTaskMark = {
  taskId: number;
  paramId: number;
  intValue: number;
};

export type LevelRuleDraft = {
  paramId: number;
  enabled: boolean;
  boolValue: 0 | 1;
  intMin: string;
  intMax: string;
};

type StoredRuleRow = {
  param_id: unknown;
  value_type: unknown;
  bool_value: unknown;
  int_min: unknown;
  int_max: unknown;
};

function asInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

function ruleMatches(stored: number | undefined, rule: ThemeLevelRule): boolean {
  if (stored == null || !Number.isInteger(stored) || stored < 0) return false;
  if (rule.valueType === "bool") {
    if (rule.boolValue !== 0 && rule.boolValue !== 1) return false;
    return stored === rule.boolValue;
  }
  if (
    rule.intMin == null ||
    rule.intMax == null ||
    rule.intMin < 0 ||
    rule.intMax < rule.intMin
  ) {
    return false;
  }
  return stored >= rule.intMin && stored <= rule.intMax;
}

/** Every rule must match. No stored value for a rule's parameter is a miss. */
export function taskMatchesLevel(
  values: ReadonlyMap<number, number> | undefined,
  rules: readonly ThemeLevelRule[],
): boolean {
  for (const rule of rules) {
    if (!ruleMatches(values?.get(rule.paramId), rule)) return false;
  }
  return true;
}

export function countMatchingTasks(
  taskIds: readonly number[],
  marks: readonly ThemeTaskMark[],
  rules: readonly ThemeLevelRule[],
): number {
  if (rules.length === 0) return taskIds.length;
  const byTask = new Map<number, Map<number, number>>();
  for (const mark of marks) {
    let bucket = byTask.get(mark.taskId);
    if (!bucket) {
      bucket = new Map();
      byTask.set(mark.taskId, bucket);
    }
    bucket.set(mark.paramId, mark.intValue);
  }
  let count = 0;
  for (const taskId of taskIds) {
    if (taskMatchesLevel(byTask.get(taskId), rules)) count += 1;
  }
  return count;
}

export function matchingTaskIds(
  taskIds: readonly number[],
  marks: readonly ThemeTaskMark[],
  rules: readonly ThemeLevelRule[],
): number[] {
  if (rules.length === 0) return [...taskIds];
  const byTask = new Map<number, Map<number, number>>();
  for (const mark of marks) {
    let bucket = byTask.get(mark.taskId);
    if (!bucket) {
      bucket = new Map();
      byTask.set(mark.taskId, bucket);
    }
    bucket.set(mark.paramId, mark.intValue);
  }
  return taskIds.filter((taskId) => taskMatchesLevel(byTask.get(taskId), rules));
}

/** Turns a database rule row into a rule. A row we cannot read is null. */
export function readStoredRule(row: StoredRuleRow): ThemeLevelRule | null {
  const paramId = asInt(row.param_id);
  if (paramId == null || paramId <= 0) return null;
  if (row.value_type === "bool") {
    const boolValue = asInt(row.bool_value);
    if (boolValue !== 0 && boolValue !== 1) return null;
    return {
      paramId,
      valueType: "bool",
      boolValue,
      intMin: null,
      intMax: null,
    };
  }
  if (row.value_type === "int") {
    const intMin = asInt(row.int_min);
    const intMax = asInt(row.int_max);
    if (
      intMin == null ||
      intMax == null ||
      intMin < 0 ||
      intMax < intMin ||
      intMax > THEME_LEVEL_INT_MAX
    ) {
      return null;
    }
    return {
      paramId,
      valueType: "int",
      boolValue: null,
      intMin,
      intMax,
    };
  }
  return null;
}

function parseBound(raw: string): number | null {
  const text = raw.trim();
  if (!/^\d+$/.test(text)) return null;
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value > THEME_LEVEL_INT_MAX) return null;
  return value;
}

/**
 * Enabled drafts become rules. An int draft with a blank or inverted range
 * is incomplete: the caller must not treat a partial count as the saved level.
 */
export function rulesFromDraft(
  params: readonly { id: number; valueType: "bool" | "int" }[],
  drafts: readonly LevelRuleDraft[],
): { rules: ThemeLevelRule[]; incomplete: boolean } {
  const byId = new Map(drafts.map((draft) => [draft.paramId, draft]));
  const rules: ThemeLevelRule[] = [];
  let incomplete = false;
  for (const param of params) {
    const draft = byId.get(param.id);
    if (!draft?.enabled) continue;
    if (param.valueType === "bool") {
      rules.push({
        paramId: param.id,
        valueType: "bool",
        boolValue: draft.boolValue === 0 ? 0 : 1,
        intMin: null,
        intMax: null,
      });
      continue;
    }
    const intMin = parseBound(draft.intMin);
    const intMax = parseBound(draft.intMax);
    if (intMin == null || intMax == null || intMin > intMax) {
      incomplete = true;
      continue;
    }
    rules.push({
      paramId: param.id,
      valueType: "int",
      boolValue: null,
      intMin,
      intMax,
    });
  }
  return { rules, incomplete };
}
