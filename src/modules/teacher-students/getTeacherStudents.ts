import type { SqlConnection } from "@/lib/db/mysql";
import {
  ensureTeacherStudentsSchema,
  loadTeacherStudentsConnection,
} from "./schema";
import { TeacherStudentsError, isPositiveInt, type TeacherStudentLink } from "./types";

type GetTeacherStudentsDeps = {
  getConnection: () => Promise<SqlConnection>;
};

type LinkedStudentRow = {
  id: number;
  login: string;
  display_name: string;
  created_at: Date | string;
};

const SQL_LIST_LINKED_STUDENTS = `
  SELECT u.id, u.login, u.display_name, ts.created_at
  FROM teacher_students ts
  INNER JOIN app_users u ON u.id = ts.student_user_id
  WHERE ts.teacher_user_id = ?
    AND u.role = 'student'
  ORDER BY u.display_name ASC, u.id ASC
`;

function mapRow(row: LinkedStudentRow): TeacherStudentLink {
  return {
    studentUserId: row.id,
    login: row.login,
    displayName: row.display_name.trim(),
    createdAt:
      row.created_at instanceof Date ? row.created_at : new Date(row.created_at),
  };
}

/**
 * Students linked to this teacher. `teacherUserId` must come from the session.
 */
export async function getTeacherStudents(
  teacherUserId: number,
  deps: GetTeacherStudentsDeps = {
    getConnection: loadTeacherStudentsConnection,
  },
): Promise<TeacherStudentLink[]> {
  if (!isPositiveInt(teacherUserId)) {
    throw new TeacherStudentsError(
      "teacherUserId must be a positive integer.",
      "invalid_input",
    );
  }

  await ensureTeacherStudentsSchema(deps.getConnection);
  const connection = await deps.getConnection();
  try {
    const rows = await connection.query<LinkedStudentRow>(
      SQL_LIST_LINKED_STUDENTS,
      [teacherUserId],
    );
    return rows.map(mapRow);
  } finally {
    connection.release();
  }
}
