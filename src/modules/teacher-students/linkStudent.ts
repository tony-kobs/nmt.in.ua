import type { SqlConnection } from "@/lib/db/mysql";
import { LOGIN_MAX_LEN, normalizeLogin } from "@/modules/auth/validateRegistration";
import {
  ensureTeacherStudentsSchema,
  loadTeacherStudentsConnection,
} from "./schema";
import {
  TeacherStudentsError,
  isPositiveInt,
  type TeacherStudentLink,
} from "./types";

export type LinkStudentByLoginInput = {
  teacherUserId: number;
  login: string;
};

export type LinkStudentByLoginResult = {
  created: boolean;
  student: TeacherStudentLink;
};

type LinkStudentDeps = {
  getConnection: () => Promise<SqlConnection>;
};

type UserLookupRow = {
  id: number;
  login: string;
  display_name: string;
  role: string;
};

const SQL_FIND_USER_BY_LOGIN = `
  SELECT id, login, display_name, role
  FROM app_users
  WHERE login = ?
  LIMIT 1
`;

const SQL_FIND_LINK = `
  SELECT ts.created_at, u.id, u.login, u.display_name
  FROM teacher_students ts
  INNER JOIN app_users u ON u.id = ts.student_user_id
  WHERE ts.teacher_user_id = ?
    AND ts.student_user_id = ?
  LIMIT 1
`;

const SQL_INSERT_LINK = `
  INSERT INTO teacher_students (teacher_user_id, student_user_id)
  VALUES (?, ?)
`;

function mysqlErrno(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("errno" in error)) {
    return undefined;
  }
  return Number((error as { errno?: number }).errno);
}

function mapLinkedStudent(row: {
  id: number;
  login: string;
  display_name: string;
  created_at: Date | string;
}): TeacherStudentLink {
  return {
    studentUserId: row.id,
    login: row.login,
    displayName: row.display_name.trim(),
    createdAt:
      row.created_at instanceof Date
        ? row.created_at
        : new Date(row.created_at),
  };
}

export function validateLinkStudentByLoginInput(
  raw: unknown,
): LinkStudentByLoginInput {
  if (typeof raw !== "object" || raw === null) {
    throw new TeacherStudentsError(
      "Request payload must be an object.",
      "invalid_input",
    );
  }

  const { teacherUserId, login } = raw as Record<string, unknown>;
  if (!isPositiveInt(teacherUserId)) {
    throw new TeacherStudentsError(
      "teacherUserId must be a positive integer.",
      "invalid_input",
    );
  }

  if (typeof login !== "string") {
    throw new TeacherStudentsError("login is required.", "invalid_input");
  }

  const normalized = normalizeLogin(login);
  if (!normalized || normalized.length > LOGIN_MAX_LEN) {
    throw new TeacherStudentsError("login is invalid.", "invalid_input");
  }

  return { teacherUserId, login: normalized };
}

/**
 * Links a student to a teacher by exact login (trimmed, lowercased).
 * `teacherUserId` must come from the trusted session, never the client.
 */
export async function linkStudentByLogin(
  rawInput: unknown,
  deps: LinkStudentDeps = { getConnection: loadTeacherStudentsConnection },
): Promise<LinkStudentByLoginResult> {
  const input = validateLinkStudentByLoginInput(rawInput);
  await ensureTeacherStudentsSchema(deps.getConnection);

  try {
    const connection = await deps.getConnection();
    try {
      const users = await connection.query<UserLookupRow>(
        SQL_FIND_USER_BY_LOGIN,
        [input.login],
      );
      const user = users[0];
      if (!user) {
        throw new TeacherStudentsError("User not found.", "not_found");
      }
      if (user.role !== "student") {
        throw new TeacherStudentsError(
          "Linked user must be a student.",
          "not_a_student",
        );
      }
      if (user.id === input.teacherUserId) {
        throw new TeacherStudentsError(
          "A teacher cannot link their own account.",
          "not_a_student",
        );
      }

      const existing = await connection.query<{
        id: number;
        login: string;
        display_name: string;
        created_at: Date | string;
      }>(SQL_FIND_LINK, [input.teacherUserId, user.id]);
      if (existing[0]) {
        throw new TeacherStudentsError(
          "Student is already linked.",
          "already_linked",
        );
      }

      const inserted = await connection.execute(SQL_INSERT_LINK, [
        input.teacherUserId,
        user.id,
      ]);
      if (inserted.affectedRows !== 1) {
        throw new TeacherStudentsError(
          "Failed to store the teacher–student link.",
          "db_error",
        );
      }

      const createdRows = await connection.query<{
        id: number;
        login: string;
        display_name: string;
        created_at: Date | string;
      }>(SQL_FIND_LINK, [input.teacherUserId, user.id]);
      const created = createdRows[0]
        ? mapLinkedStudent(createdRows[0])
        : {
            studentUserId: user.id,
            login: user.login,
            displayName: user.display_name.trim(),
            createdAt: new Date(),
          };

      return { created: true, student: created };
    } finally {
      connection.release();
    }
  } catch (error) {
    if (error instanceof TeacherStudentsError) {
      throw error;
    }
    const errno = mysqlErrno(error);
    // MySQL ER_DUP_ENTRY
    if (errno === 1062) {
      throw new TeacherStudentsError(
        "Student is already linked.",
        "already_linked",
      );
    }
    console.error("linkStudentByLogin: unexpected database error", error);
    throw new TeacherStudentsError("Database operation failed.", "db_error");
  }
}
