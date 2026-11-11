export type ThemeParamValueType = "bool" | "int";

/** One parameter defined on a theme (`themes`, not a textbook section). */
export type ThemeParam = {
  id: number;
  themeId: number;
  code: string;
  name: string;
  valueType: ThemeParamValueType;
  sort: number;
  /** Distinct tasks that already store a value for this parameter. */
  usageCount: number;
};

/** Saved mark on one quiz task. Bool is 0 or 1. Int is a whole number >= 0. */
export type TaskParamValue = {
  paramId: number;
  intValue: number;
};

/** Raw `param.<id>` field before it is checked against the task's theme. */
export type TaskParamDraft = {
  paramId: number;
  raw: string;
};

export type ThemeParamInput = {
  themeId: number;
  name: string;
  code: string;
  valueType: ThemeParamValueType;
};

export type ThemeParamUpdate = ThemeParamInput & {
  paramId: number;
};

export const MAX_THEME_PARAM_NAME = 255;
export const MAX_THEME_PARAM_CODE = 64;
export const MAX_THEME_PARAMS = 40;
export const MAX_THEME_PARAM_INT = 2_147_483_647;

export type AdminThemeOption = {
  id: number;
  code: string;
  name: string;
  ord: number;
  taskCount: number;
  /** Plain-text legend of what each difficulty number means in this theme. */
  difficultyGuide: string;
  params: ThemeParam[];
};

export const MAX_DIFFICULTY_GUIDE_LENGTH = 4000;

export type AdminQuizTaskListItem = {
  id: number;
  /** Bank title. The student sees it as a kicker when it is not the question. */
  name: string;
  /** Plain label for aria/confirm — derived from task text. */
  label: string;
  taskText: string;
  difficulty: number;
  /** True when a topic session already references this task. */
  inUse: boolean;
};

export const ADMIN_TASKS_PAGE_SIZE = 10;

export type AdminQuizTaskListPage = {
  items: AdminQuizTaskListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type AdminQuizTask = {
  id: number;
  name: string;
  taskText: string;
  themeId: number;
  answer1: string;
  answer2: string;
  answer3: string;
  answer4: string;
  rightAnswerN: 1 | 2 | 3 | 4;
  comments: string;
  difficulty: number;
  params: TaskParamValue[];
};

export type AdminQuizTaskInput = {
  name: string;
  taskText: string;
  themeId: number;
  answer1: string;
  answer2: string;
  answer3: string;
  answer4: string;
  rightAnswerN: number;
  comments?: string;
  difficulty: number;
  /** Present when the task form saved marks. Omitted leaves stored values alone. */
  paramDrafts?: TaskParamDraft[];
};

export type AdminContentErrorCode =
  | "invalid_input"
  | "theme_not_found"
  | "not_found"
  | "forbidden"
  | "in_use"
  | "type_locked"
  | "code_taken"
  | "db_error";

export class AdminContentError extends Error {
  constructor(
    message: string,
    public readonly code: AdminContentErrorCode,
  ) {
    super(message);
    this.name = "AdminContentError";
  }
}

export function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}
