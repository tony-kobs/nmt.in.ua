import {
  MAX_LEN_COMMENTS,
  MAX_LEN_TEXT,
  MAX_LEN_VARCHAR_100,
  MAX_LEN_VARCHAR_255,
  MAX_RIGHT_ANSWER,
  MIN_DIFFICULTY,
  MIN_RIGHT_ANSWER,
} from "@/modules/content-import/schema";
import {
  AdminContentError,
  MAX_THEME_PARAM_CODE,
  MAX_THEME_PARAM_INT,
  MAX_THEME_PARAM_NAME,
  isPositiveInt,
  type AdminQuizTaskInput,
  type TaskParamDraft,
  type TaskParamValue,
  type ThemeLevelInput,
  type ThemeLevelRuleDraft,
  type ThemeLevelUpdate,
  type ThemeParamInput,
  type ThemeParamUpdate,
  type ThemeParamValueType,
} from "./types";
import { wrapMathForStorage, wrapRichTextForStorage } from "./mathField";

function trimRequired(value: unknown, maxLen: number, field: string): string {
  if (typeof value !== "string") {
    throw new AdminContentError(`Invalid ${field}.`, "invalid_input");
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLen) {
    throw new AdminContentError(`Invalid ${field}.`, "invalid_input");
  }
  return trimmed;
}

const MAX_HINT_SHORT = 280;

/** Lightbulb text. Empty becomes null. Longer than the column is refused. */
export function parseHintShort(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") {
    throw new AdminContentError("Invalid hint.", "invalid_input");
  }
  const trimmed = value.trim();
  if (trimmed.length > MAX_HINT_SHORT) {
    throw new AdminContentError("Invalid hint.", "invalid_input");
  }
  return trimmed || null;
}

function trimOptional(value: unknown, maxLen: number): string {
  if (value == null) return "";
  if (typeof value !== "string") {
    throw new AdminContentError("Invalid comments.", "invalid_input");
  }
  const trimmed = value.trim();
  if (trimmed.length > maxLen) {
    throw new AdminContentError("Invalid comments.", "invalid_input");
  }
  return trimmed;
}

function readIntField(value: unknown, field: string): number {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim()
        ? Number(value.trim())
        : NaN;
  if (!Number.isInteger(numeric)) {
    throw new AdminContentError(`Invalid ${field}.`, "invalid_input");
  }
  return numeric;
}

/** Builds the DB `name` column from the task statement (no separate title field). */
export function deriveTaskName(taskText: string): string {
  const plain = taskText.replace(/\$+/g, " ").replace(/\s+/g, " ").trim();
  if (!plain) {
    throw new AdminContentError("Invalid taskText.", "invalid_input");
  }
  return plain.slice(0, MAX_LEN_VARCHAR_100);
}

/** Validates and normalizes a quiz-task form payload for create/update. */
export function parseAdminQuizTaskInput(
  raw: Record<string, unknown>
): AdminQuizTaskInput {
  const taskTextRaw = trimRequired(raw.taskText, MAX_LEN_TEXT, "taskText");
  const taskText = wrapRichTextForStorage(taskTextRaw);
  if (taskText.length > MAX_LEN_TEXT) {
    throw new AdminContentError("Invalid taskText.", "invalid_input");
  }

  // Optional legacy `name` from imports; UI no longer collects it.
  const name =
    typeof raw.name === "string" && raw.name.trim()
      ? trimRequired(raw.name, MAX_LEN_VARCHAR_100, "name")
      : deriveTaskName(taskTextRaw);

  const themeId = readIntField(raw.themeId, "themeId");
  if (!isPositiveInt(themeId)) {
    throw new AdminContentError("Invalid themeId.", "invalid_input");
  }

  const answer1 = wrapMathForStorage(
    trimRequired(raw.answer1, MAX_LEN_VARCHAR_255, "answer1")
  );
  const answer2 = wrapMathForStorage(
    trimRequired(raw.answer2, MAX_LEN_VARCHAR_255, "answer2")
  );
  const answer3 = wrapMathForStorage(
    trimRequired(raw.answer3, MAX_LEN_VARCHAR_255, "answer3")
  );
  const answer4 = wrapMathForStorage(
    trimRequired(raw.answer4, MAX_LEN_VARCHAR_255, "answer4")
  );

  for (const [label, value] of [
    ["answer1", answer1],
    ["answer2", answer2],
    ["answer3", answer3],
    ["answer4", answer4],
  ] as const) {
    if (value.length > MAX_LEN_VARCHAR_255) {
      throw new AdminContentError(`Invalid ${label}.`, "invalid_input");
    }
  }

  const rightAnswerN = readIntField(raw.rightAnswerN, "rightAnswerN");
  if (rightAnswerN < MIN_RIGHT_ANSWER || rightAnswerN > MAX_RIGHT_ANSWER) {
    throw new AdminContentError("Invalid rightAnswerN.", "invalid_input");
  }

  const difficulty = readIntField(raw.difficulty, "difficulty");
  if (difficulty < MIN_DIFFICULTY) {
    throw new AdminContentError("Invalid difficulty.", "invalid_input");
  }

  const comments = wrapRichTextForStorage(
    trimOptional(raw.comments, MAX_LEN_COMMENTS)
  );
  if (comments.length > MAX_LEN_COMMENTS) {
    throw new AdminContentError("Invalid comments.", "invalid_input");
  }

  return {
    name,
    taskText,
    themeId,
    answer1,
    answer2,
    answer3,
    answer4,
    rightAnswerN,
    comments,
    difficulty,
  };
}

export function parseThemeId(raw: unknown): number {
  const themeId = readIntField(raw, "themeId");
  if (!isPositiveInt(themeId)) {
    throw new AdminContentError("Invalid themeId.", "invalid_input");
  }
  return themeId;
}

export function parseTaskId(raw: unknown): number {
  const taskId = readIntField(raw, "taskId");
  if (!isPositiveInt(taskId)) {
    throw new AdminContentError("Invalid taskId.", "invalid_input");
  }
  return taskId;
}

/** Ids from one list page. Duplicates collapse; an empty or oversized set is rejected. */
export function parseTaskIds(raw: unknown[], max: number): number[] {
  if (!Number.isInteger(max) || max < 1 || raw.length === 0 || raw.length > max) {
    throw new AdminContentError("Invalid taskId.", "invalid_input");
  }
  const ids = [...new Set(raw.map((value) => parseTaskId(value)))];
  if (ids.length === 0 || ids.length > max) {
    throw new AdminContentError("Invalid taskId.", "invalid_input");
  }
  return ids;
}

const PARAM_CODE_RE = /^[a-z][a-z0-9_]{0,63}$/;

/** Ukrainian letters used in parameter names, mapped to a stable latin code. */
const UA_TO_LATIN: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "h",
  ґ: "g",
  д: "d",
  е: "e",
  є: "ie",
  ж: "zh",
  з: "z",
  и: "y",
  і: "i",
  ї: "i",
  й: "i",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "kh",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ь: "",
  ю: "iu",
  я: "ia",
  ы: "y",
  э: "e",
  ъ: "",
  ё: "e",
};

/** Latin code suggested from a parameter name. Empty names become `param`. */
export function suggestParamCode(name: string): string {
  const lower = name.trim().toLowerCase().replace(/[ʼ'’`]/g, "");
  let out = "";
  for (const char of lower) {
    const mapped = UA_TO_LATIN[char];
    if (mapped !== undefined) out += mapped;
    else if (/[a-z0-9]/.test(char)) out += char;
    else out += "_";
  }
  out = out.replace(/_+/g, "_").replace(/^_+|_+$/g, "");
  if (/^[0-9]/.test(out)) out = `p_${out}`;
  if (!out) out = "param";
  return out.slice(0, MAX_THEME_PARAM_CODE).replace(/_+$/g, "") || "param";
}

/** First free code. `taken` is the set already used in this theme. */
export function uniqueParamCode(base: string, taken: ReadonlySet<string>): string {
  const root = base.slice(0, MAX_THEME_PARAM_CODE);
  if (!taken.has(root)) return root;
  for (let n = 2; n < 1000; n += 1) {
    const suffix = `_${n}`;
    const candidate = `${root.slice(0, MAX_THEME_PARAM_CODE - suffix.length)}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  return root;
}

function readParamName(value: unknown): string {
  if (typeof value !== "string") {
    throw new AdminContentError("Invalid name.", "invalid_input");
  }
  const name = value.trim();
  if (
    !name ||
    name.length > MAX_THEME_PARAM_NAME ||
    /[\u0000-\u001F]/.test(name)
  ) {
    throw new AdminContentError("Invalid name.", "invalid_input");
  }
  return name;
}

function readParamCode(name: string, value: unknown): string {
  const source = typeof value === "string" ? value.trim().toLowerCase() : "";
  const code = source || suggestParamCode(name);
  if (!PARAM_CODE_RE.test(code)) {
    throw new AdminContentError("Invalid code.", "invalid_input");
  }
  return code;
}

function readParamValueType(value: unknown): ThemeParamValueType {
  if (value === "bool" || value === "int") return value;
  throw new AdminContentError("Invalid valueType.", "invalid_input");
}

/** Name, code and type for a new theme parameter. An empty code is derived. */
export function parseThemeParamInput(
  raw: Record<string, unknown>,
): ThemeParamInput {
  const themeId = parseThemeId(raw.themeId);
  const name = readParamName(raw.name);
  return {
    themeId,
    name,
    code: readParamCode(name, raw.code),
    valueType: readParamValueType(raw.valueType),
  };
}

const RULE_ON = /^rule\.(\d+)\.on$/;

function readRuleBool(value: FormDataEntryValue | null): 0 | 1 | null {
  if (value == null || value === "") return null;
  if (value === "0") return 0;
  if (value === "1") return 1;
  throw new AdminContentError("Invalid rule.", "invalid_input");
}

function readRuleBound(value: FormDataEntryValue | null): number | null {
  if (value == null) return null;
  if (typeof value !== "string") {
    throw new AdminContentError("Invalid rule.", "invalid_input");
  }
  const raw = value.trim();
  if (raw === "") return null;
  if (!/^\d+$/.test(raw)) {
    throw new AdminContentError("Invalid rule.", "invalid_input");
  }
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed > MAX_THEME_PARAM_INT) {
    throw new AdminContentError("Invalid rule.", "invalid_input");
  }
  return parsed;
}

/**
 * One enabled parameter is one rule. A bool submits 0 or 1. An int submits
 * inclusive min and max. The store checks the type against the theme.
 * A level with no enabled parameter is refused.
 */
export function parseThemeLevelForm(formData: FormData): ThemeLevelInput {
  const themeId = parseThemeId(formData.get("themeId"));
  const name = readParamName(formData.get("name"));
  const enabled: number[] = [];
  for (const [key, value] of formData.entries()) {
    const match = RULE_ON.exec(key);
    if (!match || value !== "1") continue;
    const paramId = Number(match[1]);
    if (!Number.isInteger(paramId) || paramId <= 0) {
      throw new AdminContentError("Invalid rule.", "invalid_input");
    }
    enabled.push(paramId);
  }
  if (enabled.length === 0) {
    throw new AdminContentError("A level needs a rule.", "rules_required");
  }
  if (new Set(enabled).size !== enabled.length) {
    throw new AdminContentError("Invalid rule.", "invalid_input");
  }
  const rules: ThemeLevelRuleDraft[] = enabled.map((paramId) => ({
    paramId,
    boolValue: readRuleBool(formData.get(`rule.${paramId}.bool`)),
    intMin: readRuleBound(formData.get(`rule.${paramId}.min`)),
    intMax: readRuleBound(formData.get(`rule.${paramId}.max`)),
  }));
  return { themeId, name, rules };
}

export function parseThemeLevelUpdate(formData: FormData): ThemeLevelUpdate {
  return {
    ...parseThemeLevelForm(formData),
    levelId: parseTaskId(formData.get("levelId")),
  };
}

/** Rename, code edit, or a type change. The store refuses a type change that is in use. */
export function parseThemeParamUpdate(
  raw: Record<string, unknown>,
): ThemeParamUpdate {
  return {
    ...parseThemeParamInput(raw),
    paramId: parseTaskId(raw.paramId),
  };
}

/**
 * Last `param.<id>` value wins, so a hidden 0 and a checked 1 submit as 1.
 * Fields that are not parameters are ignored.
 */
export function parseTaskParamDrafts(formData: {
  entries(): Iterable<[string, FormDataEntryValue]>;
}): TaskParamDraft[] {
  const map = new Map<number, string>();
  for (const [key, value] of formData.entries()) {
    const match = /^param\.(\d+)$/.exec(key);
    if (!match) continue;
    if (typeof value !== "string") {
      throw new AdminContentError("Invalid param.", "invalid_input");
    }
    const paramId = Number(match[1]);
    if (!Number.isInteger(paramId) || paramId <= 0) {
      throw new AdminContentError("Invalid param.", "invalid_input");
    }
    map.set(paramId, value);
  }
  return [...map.entries()].map(([paramId, raw]) => ({ paramId, raw }));
}

/**
 * Keeps only parameters of this theme.
 * Bool is stored as 0 or 1 (a missing checkbox is 0).
 * Int must be a whole number >= 0; an empty field is left unset.
 */
export function normalizeTaskParamValues(
  drafts: readonly TaskParamDraft[],
  themeParams: readonly { id: number; valueType: ThemeParamValueType }[],
): TaskParamValue[] {
  const byId = new Map<number, string>();
  for (const draft of drafts) {
    if (!Number.isInteger(draft.paramId) || draft.paramId <= 0) {
      throw new AdminContentError("Invalid param.", "invalid_input");
    }
    if (byId.has(draft.paramId)) {
      throw new AdminContentError("Invalid param.", "invalid_input");
    }
    byId.set(draft.paramId, draft.raw);
  }

  const allowed = new Set(themeParams.map((param) => param.id));
  for (const paramId of byId.keys()) {
    if (!allowed.has(paramId)) {
      throw new AdminContentError("Invalid param.", "invalid_input");
    }
  }

  const saved: TaskParamValue[] = [];
  for (const param of themeParams) {
    const raw = (byId.get(param.id) ?? "").trim();
    if (param.valueType === "bool") {
      if (raw === "" || raw === "0") {
        saved.push({ paramId: param.id, intValue: 0 });
      } else if (raw === "1") {
        saved.push({ paramId: param.id, intValue: 1 });
      } else {
        throw new AdminContentError("Invalid param.", "invalid_input");
      }
      continue;
    }
    if (raw === "") continue;
    if (!/^\d+$/.test(raw)) {
      throw new AdminContentError("Invalid param.", "invalid_input");
    }
    const intValue = Number(raw);
    if (
      !Number.isSafeInteger(intValue) ||
      intValue < 0 ||
      intValue > MAX_THEME_PARAM_INT
    ) {
      throw new AdminContentError("Invalid param.", "invalid_input");
    }
    saved.push({ paramId: param.id, intValue });
  }
  return saved;
}
