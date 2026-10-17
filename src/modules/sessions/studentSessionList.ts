import {
  SESSION_STATUS_COMPLETED,
  SESSION_TYPE_MENTOR,
  SESSION_TYPE_NMT,
  SESSION_TYPE_USER,
} from "./types";

/**
 * A finished attempt: status completed, or every task answered with time stored.
 * Matches `resolveSessionDisplayStatus` for the completed branch.
 */
export function isFinishedLearningSession(row: {
  session_status: number;
  tasks_number: number;
  right_number: number;
  time: number;
}): boolean {
  return (
    row.session_status === SESSION_STATUS_COMPLETED ||
    (row.tasks_number > 0 &&
      row.right_number >= row.tasks_number &&
      row.time > 0)
  );
}

/**
 * Student `/sessions`: teacher assignments (not a cancelled-only link),
 * finished topic tests, and finished NMT simulator attempts.
 */
export function belongsInStudentSessions(row: {
  session_type: number;
  session_status: number;
  tasks_number: number;
  right_number: number;
  time: number;
  /** Set when the session is a member of a mentor assignment. */
  member_session_id?: number | null;
  /** Set when that assignment is still active. */
  assignment_id?: number | null;
}): boolean {
  if (row.session_type === SESSION_TYPE_MENTOR) {
    const linked = row.member_session_id != null;
    const active = row.assignment_id != null;
    if (linked && !active) return false;
    return true;
  }
  if (
    row.session_type === SESSION_TYPE_USER ||
    row.session_type === SESSION_TYPE_NMT
  ) {
    return isFinishedLearningSession(row);
  }
  return false;
}
