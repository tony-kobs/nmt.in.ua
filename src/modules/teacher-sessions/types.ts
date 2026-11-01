export const MAX_SESSION_TASKS = 30;
export const MAX_SESSION_TITLE = 160;

export type TeacherSessionOrigin = "manual" | "quick" | "migrated";

export type SessionTaskOption = {
  number: number;
  text: string;
};

/** Teacher-only view. Includes the key and the explanation. */
export type SessionTaskView = {
  id: number;
  position: number;
  name: string;
  prompt: string;
  difficulty: number;
  options: SessionTaskOption[];
  correctNumber: number | null;
  explanation: string;
  missing: boolean;
};

export type TeacherSessionSummary = {
  id: number;
  title: string;
  themeId: number;
  themeName: string;
  difficulty: number;
  taskCount: number;
  assignmentCount: number;
  updatedAt: number;
};

export type TeacherSessionDetail = TeacherSessionSummary & {
  origin: TeacherSessionOrigin;
  /** Active assignments. Editing still works; the UI warns. */
  assignmentCount: number;
  /** Any assignment row, including cancelled. Blocks delete. */
  referenceCount: number;
  tasks: SessionTaskView[];
};

export type TeacherSessionsErrorCode =
  | "invalid_input"
  | "theme_not_found"
  | "task_not_in_theme"
  | "too_many"
  | "empty_assigned"
  | "theme_locked"
  | "not_found"
  | "forbidden"
  | "assigned_locked"
  | "db_error";

export class TeacherSessionsError extends Error {
  constructor(
    message: string,
    public readonly code: TeacherSessionsErrorCode,
  ) {
    super(message);
    this.name = "TeacherSessionsError";
  }
}

export function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}
