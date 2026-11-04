import type { SqlConnection } from "@/lib/db/mysql";
import { ensureMentorAssignmentsSchema } from "@/modules/mentor-assignments/schema";
import { nowUnixSec } from "@/modules/testing/sessionElapsed";
import { resolveLearningSessionsLimit } from "./getLearningSessions";
import {
  buildLearningSessionRows,
  type LearningSessionRow,
  type TaskSessionRecord,
} from "./types";

export type RosterStudentRef = {
  studentUserId: number;
  login: string;
  displayName: string;
};

export type TeacherLearningSessionRow = LearningSessionRow & {
  studentUserId: number;
  studentLogin: string;
  studentDisplayName: string;
};

type Deps = {
  getConnection: () => Promise<SqlConnection>;
  nowSec?: () => number;
  ensureSchema?: () => Promise<void>;
};

type SqlRow = TaskSessionRecord & {
  user_id: number;
  login: string;
  display_name: string;
  available_at: number | null;
  due_at: number | null;
};

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

/**
 * Recent learning sessions for a teacher roster (or one student).
 * Newest first. Includes student identity for the class table.
 */
export async function getTeacherLearningSessions(
  students: RosterStudentRef[],
  options: { studentUserId?: number; limit?: number } = {},
  deps: Deps = { getConnection: loadDefaultConnection },
): Promise<TeacherLearningSessionRow[]> {
  const roster =
    options.studentUserId != null
      ? students.filter((s) => s.studentUserId === options.studentUserId)
      : students;

  if (roster.length === 0) return [];

  const limit = resolveLearningSessionsLimit(options.limit);
  await (deps.ensureSchema ??
    (() => ensureMentorAssignmentsSchema(deps.getConnection)))();

  const ids = roster.map((s) => s.studentUserId);
  const placeholders = ids.map(() => "?").join(", ");
  const byId = new Map(roster.map((s) => [s.studentUserId, s]));

  const sql = `
  SELECT
    ts.id,
    ts.user_id,
    u.login,
    u.display_name,
    ts.theme_id,
    CASE
      WHEN NULLIF(TRIM(t.name), '') IS NOT NULL THEN TRIM(t.name)
      WHEN ts.theme_id = 1 THEN 'Елементарні дії'
      WHEN ts.theme_id IS NULL THEN 'Загальна діагностика'
      ELSE 'Тема недоступна'
    END AS theme_name,
    ts.tasks_number,
    ts.right_number,
    ts.time,
    ts.session_status,
    ts.session_type,
    ts.start_time,
    ts.expire_time,
    ma.available_at,
    ma.due_at
  FROM task_sessions ts
  LEFT JOIN themes t ON t.id = ts.theme_id
  INNER JOIN app_users u ON u.id = ts.user_id
  LEFT JOIN mentor_assignment_members mam ON mam.session_id = ts.id
  LEFT JOIN mentor_assignments ma
    ON ma.id = mam.assignment_id AND ma.status = 'active'
  WHERE ts.user_id IN (${placeholders})
  ORDER BY ts.id DESC
  LIMIT ${limit}
`;

  const connection = await deps.getConnection();
  try {
    const raw = await connection.query<SqlRow>(sql, ids);
    const nowSec = (deps.nowSec ?? nowUnixSec)();
    const base = buildLearningSessionRows(raw, nowSec);

    return base.map((row, index) => {
      const record = raw[index]!;
      const student =
        byId.get(record.user_id) ??
        ({
          studentUserId: record.user_id,
          login: String(record.login ?? "").trim(),
          displayName: String(record.display_name ?? "").trim(),
        } satisfies RosterStudentRef);

      return {
        ...row,
        studentUserId: student.studentUserId,
        studentLogin: student.login,
        studentDisplayName: student.displayName || student.login,
      };
    });
  } finally {
    connection.release();
  }
}

/** Mean % of completed sessions per student (for picker labels / sort). */
export function averageCompletedPercent(
  rows: TeacherLearningSessionRow[],
): Map<number, number | null> {
  const buckets = new Map<number, number[]>();
  for (const row of rows) {
    if (row.status !== "completed" || row.percent == null) continue;
    const list = buckets.get(row.studentUserId) ?? [];
    list.push(row.percent);
    buckets.set(row.studentUserId, list);
  }

  const out = new Map<number, number | null>();
  for (const [id, percents] of buckets) {
    out.set(
      id,
      percents.reduce((sum, value) => sum + value, 0) / percents.length,
    );
  }
  return out;
}
