import type { SqlConnection } from "@/lib/db/mysql";
import {
  ensureTeacherStudentsSchema,
  loadTeacherStudentsConnection,
} from "./schema";
import { TeacherStudentsError, isPositiveInt } from "./types";

export type UnlinkStudentInput = {
  teacherUserId: number;
  studentUserId: number;
};

type UnlinkStudentDeps = {
  getConnection: () => Promise<SqlConnection>;
};

const SQL_DELETE_LINK = `
  DELETE FROM teacher_students
  WHERE teacher_user_id = ?
    AND student_user_id = ?
`;

export function validateUnlinkStudentInput(raw: unknown): UnlinkStudentInput {
  if (typeof raw !== "object" || raw === null) {
    throw new TeacherStudentsError(
      "Request payload must be an object.",
      "invalid_input",
    );
  }

  const { teacherUserId, studentUserId } = raw as Record<string, unknown>;
  if (!isPositiveInt(teacherUserId) || !isPositiveInt(studentUserId)) {
    throw new TeacherStudentsError(
      "teacherUserId and studentUserId must be positive integers.",
      "invalid_input",
    );
  }

  if (teacherUserId === studentUserId) {
    throw new TeacherStudentsError(
      "teacherUserId and studentUserId must differ.",
      "invalid_input",
    );
  }

  return { teacherUserId, studentUserId };
}

/**
 * Removes a teacher–student link. Only the session teacher's own rows
 * are deleted — `teacherUserId` must come from the trusted session.
 */
export async function unlinkStudent(
  rawInput: unknown,
  deps: UnlinkStudentDeps = { getConnection: loadTeacherStudentsConnection },
): Promise<void> {
  const input = validateUnlinkStudentInput(rawInput);
  await ensureTeacherStudentsSchema(deps.getConnection);

  try {
    const connection = await deps.getConnection();
    try {
      const result = await connection.execute(SQL_DELETE_LINK, [
        input.teacherUserId,
        input.studentUserId,
      ]);
      if (result.affectedRows !== 1) {
        throw new TeacherStudentsError(
          "Teacher–student link not found.",
          "not_found",
        );
      }
    } finally {
      connection.release();
    }
  } catch (error) {
    if (error instanceof TeacherStudentsError) {
      throw error;
    }
    console.error("unlinkStudent: unexpected database error", error);
    throw new TeacherStudentsError("Database operation failed.", "db_error");
  }
}
