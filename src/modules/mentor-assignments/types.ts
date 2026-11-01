import type { SessionTaskView } from "@/modules/teacher-sessions/types";

export type AssignmentScheduleMode = "now" | "datetime";

export type AssignmentStatus = "active" | "cancelled";

/** Member progress relative to assignment due_at. */
export type MemberProgressStatus = "completed" | "overdue" | "pending";

export type MentorAssignmentSummary = {
  id: number;
  themeId: number;
  difficulty: number;
  themeName: string;
  tasksNumber: number;
  availableAt: number;
  dueAt: number;
  scheduleMode: AssignmentScheduleMode;
  status: AssignmentStatus;
  createdAt: number;
  memberCount: number;
  completedCount: number;
  overdueCount: number;
  /** Teacher session (`sessions.id`). Null until the backfill migration runs. */
  learningSessionId: number | null;
  sessionTitle: string | null;
};

export type MentorAssignmentMember = {
  studentUserId: number;
  login: string;
  displayName: string;
  sessionId: number | null;
  progress: MemberProgressStatus;
};

export type MentorAssignmentDetail = MentorAssignmentSummary & {
  members: MentorAssignmentMember[];
  tasks: SessionTaskView[];
};

export type MentorAssignmentsErrorCode =
  | "invalid_input"
  | "theme_not_found"
  | "insufficient_tasks"
  | "no_students"
  | "students_not_linked"
  | "not_found"
  | "cancelled"
  | "forbidden"
  | "session_not_found"
  | "session_empty"
  | "db_error";

export class MentorAssignmentsError extends Error {
  constructor(
    message: string,
    public readonly code: MentorAssignmentsErrorCode
  ) {
    super(message);
    this.name = "MentorAssignmentsError";
  }
}

export function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function resolveMemberProgress(
  session: {
    session_status: number;
    tasks_number: number;
    right_number: number;
    time: number;
  } | null,
  dueAt: number,
  nowSec: number
): MemberProgressStatus {
  if (
    session &&
    (session.session_status === 1 ||
      (session.tasks_number > 0 &&
        session.right_number >= session.tasks_number &&
        session.time > 0))
  ) {
    return "completed";
  }
  if (nowSec >= dueAt) {
    return "overdue";
  }
  return "pending";
}
