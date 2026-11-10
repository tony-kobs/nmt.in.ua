export type AdminThemeOption = {
  id: number;
  code: string;
  name: string;
  ord: number;
  taskCount: number;
  /** Plain-text legend of what each difficulty number means in this theme. */
  difficultyGuide: string;
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
};

export type AdminContentErrorCode =
  | "invalid_input"
  | "theme_not_found"
  | "not_found"
  | "forbidden"
  | "in_use"
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
