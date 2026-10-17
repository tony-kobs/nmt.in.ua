import type { SqlConnection } from "@/lib/db/mysql";
import {
  SESSION_STATUS_COMPLETED,
  SESSION_STATUS_PLANNED,
  SESSION_TYPE_MENTOR,
} from "@/modules/sessions/types";
import { TOPIC_TEST_TASK_COUNT } from "@/modules/testing/startTopicTest";
import { nowUnixSec } from "@/modules/testing/sessionElapsed";
import {
  notifyAssignedSessions,
  type AssignedSessionNotice,
} from "@/modules/notifications/topicReminders";
import { resolveAssignmentSchedule } from "./dueAt";
import { ensureTeacherStudentsSchema } from "@/modules/teacher-students/schema";
import {
  ensureMentorAssignmentsSchema,
  loadMentorAssignmentsConnection,
} from "./schema";
import {
  isPositiveInt,
  MentorAssignmentsError,
  resolveMemberProgress,
  type AssignmentScheduleMode,
  type MentorAssignmentDetail,
  type MentorAssignmentMember,
  type MentorAssignmentSummary,
} from "./types";

export { resolveAssignmentDueAt, resolveAssignmentSchedule } from "./dueAt";

type Deps = {
  getConnection: () => Promise<SqlConnection>;
  nowSec?: () => number;
};

type AssignmentRow = {
  id: number;
  teacher_user_id: number;
  theme_id: number;
  difficulty: number;
  theme_name: string;
  tasks_number: number;
  available_at: number;
  due_at: number;
  schedule_mode: AssignmentScheduleMode;
  status: "active" | "cancelled";
  created_at: number;
};

type MemberRow = {
  student_user_id: number;
  login: string;
  display_name: string;
  session_id: number | null;
  session_status: number | null;
  tasks_number: number | null;
  right_number: number | null;
  time: number | null;
};

const SQL_THEME = `SELECT id, name FROM themes WHERE id = ? LIMIT 1`;

const SQL_COUNT_TASKS_AT_DIFFICULTY = `
  SELECT COUNT(*) AS total
  FROM quiz_tasks
  WHERE theme_id = ? AND difficulty = ?
`;

const SQL_INSERT_ASSIGNMENT = `
  INSERT INTO mentor_assignments (
    teacher_user_id,
    theme_id,
    difficulty,
    tasks_number,
    available_at,
    due_at,
    schedule_mode,
    status,
    created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)
`;

const SQL_INSERT_MEMBER = `
  INSERT INTO mentor_assignment_members (assignment_id, student_user_id, session_id)
  VALUES (?, ?, ?)
`;

const SQL_INSERT_SESSION = `
  INSERT INTO task_sessions (
    user_id, session_type, theme_id, tasks_number,
    right_number, time, session_status, start_time, expire_time
  ) VALUES (?, ?, ?, ?, 0, 0, ?, 0, ?)
`;

const SQL_LIST_ASSIGNMENTS = `
  SELECT
    a.id,
    a.teacher_user_id,
    a.theme_id,
    a.difficulty,
    t.name AS theme_name,
    a.tasks_number,
    a.available_at,
    a.due_at,
    a.schedule_mode,
    a.status,
    a.created_at
  FROM mentor_assignments a
  INNER JOIN themes t ON t.id = a.theme_id
  WHERE a.teacher_user_id = ?
    AND a.status = 'active'
  ORDER BY a.created_at DESC, a.id DESC
`;

const SQL_GET_ASSIGNMENT = `
  SELECT
    a.id,
    a.teacher_user_id,
    a.theme_id,
    a.difficulty,
    t.name AS theme_name,
    a.tasks_number,
    a.available_at,
    a.due_at,
    a.schedule_mode,
    a.status,
    a.created_at
  FROM mentor_assignments a
  INNER JOIN themes t ON t.id = a.theme_id
  WHERE a.id = ?
  LIMIT 1
`;

const SQL_LIST_MEMBERS = `
  SELECT
    m.student_user_id,
    u.login,
    u.display_name,
    m.session_id,
    s.session_status,
    s.tasks_number,
    s.right_number,
    s.time
  FROM mentor_assignment_members m
  INNER JOIN app_users u ON u.id = m.student_user_id
  LEFT JOIN task_sessions s ON s.id = m.session_id
  WHERE m.assignment_id = ?
  ORDER BY u.display_name ASC, u.id ASC
`;

function uniquePositiveInts(values: number[]): number[] {
  return [...new Set(values.filter(isPositiveInt))];
}

async function assertStudentsLinked(
  connection: SqlConnection,
  teacherUserId: number,
  studentIds: number[]
): Promise<void> {
  if (studentIds.length === 0) {
    throw new MentorAssignmentsError(
      "Select at least one student.",
      "no_students"
    );
  }

  // mysql2 expands IN (?) with an array
  const linked = await connection.query<{ student_user_id: number }>(
    `
      SELECT student_user_id
      FROM teacher_students
      WHERE teacher_user_id = ?
        AND student_user_id IN (${studentIds.map(() => "?").join(",")})
    `,
    [teacherUserId, ...studentIds]
  );

  if (linked.length !== studentIds.length) {
    throw new MentorAssignmentsError(
      "One or more students are not linked to this teacher.",
      "students_not_linked"
    );
  }
}

async function insertMemberSession(
  connection: SqlConnection,
  studentUserId: number,
  themeId: number,
  tasksNumber: number,
  expireTime: number
): Promise<number> {
  const inserted = await connection.execute(SQL_INSERT_SESSION, [
    studentUserId,
    SESSION_TYPE_MENTOR,
    themeId,
    tasksNumber,
    SESSION_STATUS_PLANNED,
    expireTime,
  ]);
  if (inserted.insertId <= 0) {
    throw new MentorAssignmentsError(
      "Failed to create mentor session.",
      "db_error"
    );
  }
  return inserted.insertId;
}

async function deleteSessionIfCancelable(
  connection: SqlConnection,
  sessionId: number | null,
  studentUserId: number
): Promise<void> {
  if (sessionId == null || sessionId <= 0) return;

  const rows = await connection.query<{
    session_status: number;
    tasks_number: number;
    right_number: number;
    time: number;
  }>(
    `SELECT session_status, tasks_number, right_number, time
     FROM task_sessions WHERE id = ? AND user_id = ? LIMIT 1`,
    [sessionId, studentUserId]
  );
  const session = rows[0];
  if (!session) return;

  const completed =
    session.session_status === SESSION_STATUS_COMPLETED ||
    (session.tasks_number > 0 &&
      session.right_number >= session.tasks_number &&
      session.time > 0);
  if (completed) return;

  await connection.execute("DELETE FROM tasks2session WHERE session_id = ?", [
    sessionId,
  ]);
  await connection.execute(
    "DELETE FROM task_sessions WHERE id = ? AND user_id = ?",
    [sessionId, studentUserId]
  );
}

function mapMembers(
  rows: MemberRow[],
  dueAt: number,
  nowSec: number
): MentorAssignmentMember[] {
  return rows.map((row) => {
    const session =
      row.session_id != null && row.session_status != null
        ? {
            session_status: row.session_status,
            tasks_number: row.tasks_number ?? 0,
            right_number: row.right_number ?? 0,
            time: row.time ?? 0,
          }
        : null;
    return {
      studentUserId: row.student_user_id,
      login: row.login,
      displayName: row.display_name.trim(),
      sessionId: row.session_id,
      progress: resolveMemberProgress(session, dueAt, nowSec),
    };
  });
}

function summarize(
  row: AssignmentRow,
  members: MentorAssignmentMember[]
): MentorAssignmentSummary {
  return {
    id: row.id,
    themeId: row.theme_id,
    difficulty: row.difficulty,
    themeName: row.theme_name.trim(),
    tasksNumber: row.tasks_number,
    availableAt: row.available_at,
    dueAt: row.due_at,
    scheduleMode: row.schedule_mode,
    status: row.status,
    createdAt: row.created_at,
    memberCount: members.length,
    completedCount: members.filter((m) => m.progress === "completed").length,
    overdueCount: members.filter((m) => m.progress === "overdue").length,
  };
}

export type CreateMentorAssignmentInput = {
  teacherUserId: number;
  themeId: number;
  difficulty: number;
  studentIds: number[];
  scheduleMode: AssignmentScheduleMode;
  /** Unix seconds — when the test opens (datetime mode). */
  availableAtUnix?: number | null;
  /** Unix seconds — end of the completion window (required). */
  dueAtUnix?: number | null;
  tasksNumber?: number;
};

export async function createMentorAssignment(
  input: CreateMentorAssignmentInput,
  deps: Deps = { getConnection: loadMentorAssignmentsConnection }
): Promise<MentorAssignmentDetail> {
  if (!isPositiveInt(input.teacherUserId) || !isPositiveInt(input.themeId)) {
    throw new MentorAssignmentsError(
      "teacherUserId and themeId must be positive integers.",
      "invalid_input"
    );
  }
  if (input.scheduleMode !== "now" && input.scheduleMode !== "datetime") {
    throw new MentorAssignmentsError(
      "scheduleMode must be now or datetime.",
      "invalid_input"
    );
  }

  if (!isPositiveInt(input.difficulty)) {
    throw new MentorAssignmentsError(
      "difficulty must be a positive integer.",
      "invalid_input"
    );
  }

  const studentIds = uniquePositiveInts(input.studentIds);
  const tasksNumber =
    input.tasksNumber != null && isPositiveInt(input.tasksNumber)
      ? input.tasksNumber
      : TOPIC_TEST_TASK_COUNT;

  await ensureMentorAssignmentsSchema(deps.getConnection);
  await ensureTeacherStudentsSchema(deps.getConnection);
  const connection = await deps.getConnection();
  const nowSec = deps.nowSec ?? nowUnixSec;
  let assignmentId = 0;
  const pendingNotes: AssignedSessionNotice[] = [];
  let committed = false;

  try {
    await connection.beginTransaction();

    const themes = await connection.query<{ id: number; name: string }>(
      SQL_THEME,
      [input.themeId]
    );
    if (!themes[0]) {
      await connection.rollback();
      throw new MentorAssignmentsError("Theme not found.", "theme_not_found");
    }

    const taskCounts = await connection.query<{ total: number | string }>(
      SQL_COUNT_TASKS_AT_DIFFICULTY,
      [input.themeId, input.difficulty]
    );
    if (Number(taskCounts[0]?.total ?? 0) < 1) {
      await connection.rollback();
      throw new MentorAssignmentsError(
        "No quiz tasks at this difficulty for the theme.",
        "insufficient_tasks"
      );
    }

    await assertStudentsLinked(connection, input.teacherUserId, studentIds);

    const schedule = resolveAssignmentSchedule(
      input.scheduleMode,
      input.availableAtUnix ?? null,
      input.dueAtUnix ?? null,
      nowSec()
    );
    const createdAt = nowSec();

    const inserted = await connection.execute(SQL_INSERT_ASSIGNMENT, [
      input.teacherUserId,
      input.themeId,
      input.difficulty,
      tasksNumber,
      schedule.availableAt,
      schedule.dueAt,
      input.scheduleMode,
      createdAt,
    ]);
    if (inserted.insertId <= 0) {
      await connection.rollback();
      throw new MentorAssignmentsError(
        "Failed to create assignment.",
        "db_error"
      );
    }
    assignmentId = inserted.insertId;

    for (const studentId of studentIds) {
      const sessionId = await insertMemberSession(
        connection,
        studentId,
        input.themeId,
        tasksNumber,
        schedule.dueAt
      );
      await connection.execute(SQL_INSERT_MEMBER, [
        assignmentId,
        studentId,
        sessionId,
      ]);
      pendingNotes.push({
        userId: studentId,
        themeName: themes[0].name,
        tasksNumber,
        sessionId,
        availableAt: schedule.availableAt,
        dueAt: schedule.dueAt,
        nowSec: createdAt,
      });
    }

    await connection.commit();
    committed = true;
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    if (error instanceof MentorAssignmentsError) throw error;
    console.error("createMentorAssignment: unexpected error", error);
    throw new MentorAssignmentsError("Database operation failed.", "db_error");
  } finally {
    connection.release();
  }

  if (committed) await notifyAssignedSessions(pendingNotes);

  return getMentorAssignmentDetail(assignmentId, input.teacherUserId, deps);
}

export async function listMentorAssignments(
  teacherUserId: number,
  deps: Deps = { getConnection: loadMentorAssignmentsConnection }
): Promise<MentorAssignmentSummary[]> {
  if (!isPositiveInt(teacherUserId)) {
    throw new MentorAssignmentsError(
      "teacherUserId must be a positive integer.",
      "invalid_input"
    );
  }

  await ensureMentorAssignmentsSchema(deps.getConnection);
  const connection = await deps.getConnection();
  const nowSec = (deps.nowSec ?? nowUnixSec)();

  try {
    const rows = await connection.query<AssignmentRow>(SQL_LIST_ASSIGNMENTS, [
      teacherUserId,
    ]);
    const summaries: MentorAssignmentSummary[] = [];
    for (const row of rows) {
      const members = mapMembers(
        await connection.query<MemberRow>(SQL_LIST_MEMBERS, [row.id]),
        row.due_at,
        nowSec
      );
      summaries.push(summarize(row, members));
    }
    return summaries;
  } finally {
    connection.release();
  }
}

export async function getMentorAssignmentDetail(
  assignmentId: number,
  teacherUserId: number,
  deps: Deps = { getConnection: loadMentorAssignmentsConnection }
): Promise<MentorAssignmentDetail> {
  if (!isPositiveInt(assignmentId) || !isPositiveInt(teacherUserId)) {
    throw new MentorAssignmentsError(
      "assignmentId and teacherUserId must be positive integers.",
      "invalid_input"
    );
  }

  await ensureMentorAssignmentsSchema(deps.getConnection);
  const connection = await deps.getConnection();
  const nowSec = (deps.nowSec ?? nowUnixSec)();

  try {
    const rows = await connection.query<AssignmentRow>(SQL_GET_ASSIGNMENT, [
      assignmentId,
    ]);
    const row = rows[0];
    if (!row) {
      throw new MentorAssignmentsError("Assignment not found.", "not_found");
    }
    if (row.teacher_user_id !== teacherUserId) {
      throw new MentorAssignmentsError("Forbidden.", "forbidden");
    }

    const members = mapMembers(
      await connection.query<MemberRow>(SQL_LIST_MEMBERS, [assignmentId]),
      row.due_at,
      nowSec
    );
    return { ...summarize(row, members), members };
  } finally {
    connection.release();
  }
}

export async function cancelMentorAssignment(
  assignmentId: number,
  teacherUserId: number,
  deps: Deps = { getConnection: loadMentorAssignmentsConnection }
): Promise<void> {
  if (!isPositiveInt(assignmentId) || !isPositiveInt(teacherUserId)) {
    throw new MentorAssignmentsError(
      "assignmentId and teacherUserId must be positive integers.",
      "invalid_input"
    );
  }

  await ensureMentorAssignmentsSchema(deps.getConnection);
  const connection = await deps.getConnection();

  try {
    await connection.beginTransaction();

    const rows = await connection.query<AssignmentRow>(SQL_GET_ASSIGNMENT, [
      assignmentId,
    ]);
    const row = rows[0];
    if (!row) {
      await connection.rollback();
      throw new MentorAssignmentsError("Assignment not found.", "not_found");
    }
    if (row.teacher_user_id !== teacherUserId) {
      await connection.rollback();
      throw new MentorAssignmentsError("Forbidden.", "forbidden");
    }
    if (row.status === "cancelled") {
      await connection.rollback();
      throw new MentorAssignmentsError(
        "Assignment already cancelled.",
        "cancelled"
      );
    }

    const members = await connection.query<MemberRow>(SQL_LIST_MEMBERS, [
      assignmentId,
    ]);
    for (const member of members) {
      await deleteSessionIfCancelable(
        connection,
        member.session_id,
        member.student_user_id
      );
    }

    await connection.execute(
      `UPDATE mentor_assignments SET status = 'cancelled' WHERE id = ?`,
      [assignmentId]
    );
    await connection.commit();
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    if (error instanceof MentorAssignmentsError) throw error;
    console.error("cancelMentorAssignment: unexpected error", error);
    throw new MentorAssignmentsError("Database operation failed.", "db_error");
  } finally {
    connection.release();
  }
}

export type UpdateAssignmentMembersInput = {
  assignmentId: number;
  teacherUserId: number;
  studentIds: number[];
};

/**
 * Replaces the non-completed member set. Completed students stay assigned.
 */
export async function updateMentorAssignmentMembers(
  input: UpdateAssignmentMembersInput,
  deps: Deps = { getConnection: loadMentorAssignmentsConnection }
): Promise<MentorAssignmentDetail> {
  if (
    !isPositiveInt(input.assignmentId) ||
    !isPositiveInt(input.teacherUserId)
  ) {
    throw new MentorAssignmentsError(
      "assignmentId and teacherUserId must be positive integers.",
      "invalid_input"
    );
  }

  const wanted = uniquePositiveInts(input.studentIds);

  await ensureMentorAssignmentsSchema(deps.getConnection);
  await ensureTeacherStudentsSchema(deps.getConnection);
  const connection = await deps.getConnection();
  const nowSec = deps.nowSec ?? nowUnixSec;
  const pendingNotes: AssignedSessionNotice[] = [];
  let committed = false;

  try {
    await connection.beginTransaction();

    const rows = await connection.query<AssignmentRow>(SQL_GET_ASSIGNMENT, [
      input.assignmentId,
    ]);
    const row = rows[0];
    if (!row) {
      await connection.rollback();
      throw new MentorAssignmentsError("Assignment not found.", "not_found");
    }
    if (row.teacher_user_id !== input.teacherUserId) {
      await connection.rollback();
      throw new MentorAssignmentsError("Forbidden.", "forbidden");
    }
    if (row.status === "cancelled") {
      await connection.rollback();
      throw new MentorAssignmentsError(
        "Cannot edit a cancelled assignment.",
        "cancelled"
      );
    }

    const current = mapMembers(
      await connection.query<MemberRow>(SQL_LIST_MEMBERS, [input.assignmentId]),
      row.due_at,
      nowSec()
    );

    const completedIds = new Set(
      current
        .filter((m) => m.progress === "completed")
        .map((m) => m.studentUserId)
    );
    const finalIds = uniquePositiveInts([...wanted, ...completedIds]);
    if (finalIds.length === 0) {
      await connection.rollback();
      throw new MentorAssignmentsError(
        "Select at least one student.",
        "no_students"
      );
    }

    await assertStudentsLinked(connection, input.teacherUserId, finalIds);

    const currentById = new Map(
      current.map((m) => [m.studentUserId, m] as const)
    );

    for (const member of current) {
      if (finalIds.includes(member.studentUserId)) continue;
      if (member.progress === "completed") continue;
      await deleteSessionIfCancelable(
        connection,
        member.sessionId,
        member.studentUserId
      );
      await connection.execute(
        `DELETE FROM mentor_assignment_members
         WHERE assignment_id = ? AND student_user_id = ?`,
        [input.assignmentId, member.studentUserId]
      );
    }

    for (const studentId of finalIds) {
      if (currentById.has(studentId)) continue;
      const sessionId = await insertMemberSession(
        connection,
        studentId,
        row.theme_id,
        row.tasks_number,
        row.due_at
      );
      await connection.execute(SQL_INSERT_MEMBER, [
        input.assignmentId,
        studentId,
        sessionId,
      ]);
      pendingNotes.push({
        userId: studentId,
        themeName: row.theme_name,
        tasksNumber: row.tasks_number,
        sessionId,
        availableAt: row.available_at,
        dueAt: row.due_at,
        nowSec: nowSec(),
      });
    }

    await connection.commit();
    committed = true;
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    if (error instanceof MentorAssignmentsError) throw error;
    console.error("updateMentorAssignmentMembers: unexpected error", error);
    throw new MentorAssignmentsError("Database operation failed.", "db_error");
  } finally {
    connection.release();
  }

  if (committed) await notifyAssignedSessions(pendingNotes);

  return getMentorAssignmentDetail(
    input.assignmentId,
    input.teacherUserId,
    deps
  );
}
