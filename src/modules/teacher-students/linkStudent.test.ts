import assert from "node:assert/strict";
import test from "node:test";
import type { SqlConnection } from "@/lib/db/mysql";
import {
  linkStudentByEmail,
  validateLinkStudentByEmailInput,
} from "./linkStudent";
import { TeacherStudentsError } from "./types";

type UserRow = {
  id: number;
  login: string;
  display_name: string;
  role: string;
};

function studentRow(overrides: Partial<UserRow> = {}): UserRow {
  return {
    id: 1,
    login: "demo-student",
    display_name: "Олена Коваленко",
    role: "student",
    ...overrides,
  };
}

function makeConnection(options: {
  user?: UserRow | null;
  existing?: boolean;
  failInsert?: boolean;
  duplicate?: boolean;
} = {}) {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const connection: SqlConnection = {
    beginTransaction: async () => {},
    query: async <T,>(sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes("FROM app_users")) {
        return (options.user ? [options.user] : []) as T[];
      }
      if (sql.includes("FROM teacher_students")) {
        if (!options.existing) return [] as T[];
        return [
          {
            id: options.user?.id ?? 1,
            login: options.user?.login ?? "demo-student",
            display_name: options.user?.display_name ?? "Олена",
            created_at: new Date("2026-09-11T10:00:00.000Z"),
          },
        ] as T[];
      }
      return [] as T[];
    },
    execute: async (sql, params = []) => {
      calls.push({ sql, params });
      if (sql.includes("CREATE TABLE")) {
        return { insertId: 0, affectedRows: 0 };
      }
      if (sql.includes("INSERT INTO teacher_students")) {
        if (options.duplicate) {
          throw Object.assign(new Error("Duplicate entry"), { errno: 1062 });
        }
        return {
          insertId: 0,
          affectedRows: options.failInsert ? 0 : 1,
        };
      }
      return { insertId: 0, affectedRows: 0 };
    },
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  };
  return { connection, calls };
}

test("validateLinkStudentByEmailInput trims and lowercases email", () => {
  assert.deepEqual(
    validateLinkStudentByEmailInput({
      teacherUserId: 2,
      email: "  Pupil@School.UA  ",
    }),
    { teacherUserId: 2, email: "pupil@school.ua" },
  );
});

test("validateLinkStudentByEmailInput rejects a missing teacher or a bad email", () => {
  assert.throws(
    () =>
      validateLinkStudentByEmailInput({
        teacherUserId: 0,
        email: "pupil@school.ua",
      }),
    (error: unknown) =>
      error instanceof TeacherStudentsError && error.code === "invalid_input",
  );
  assert.throws(
    () =>
      validateLinkStudentByEmailInput({ teacherUserId: 2, email: "   " }),
    (error: unknown) =>
      error instanceof TeacherStudentsError && error.code === "invalid_email",
  );
  assert.throws(
    () =>
      validateLinkStudentByEmailInput({
        teacherUserId: 2,
        email: "not-an-email",
      }),
    (error: unknown) =>
      error instanceof TeacherStudentsError && error.code === "invalid_email",
  );
});

test("linkStudentByEmail inserts a unique pair for an existing student", async () => {
  const mock = makeConnection({ user: studentRow() });
  const result = await linkStudentByEmail(
    { teacherUserId: 2, email: "  Pupil@School.UA " },
    { getConnection: async () => mock.connection },
  );

  assert.equal(result.created, true);
  assert.equal(result.student.studentUserId, 1);
  assert.equal(result.student.login, "demo-student");
  assert.equal(result.student.displayName, "Олена Коваленко");

  const lookup = mock.calls.find((call) => call.sql.includes("FROM app_users"));
  assert.equal(lookup?.params?.[0], "pupil@school.ua");
  assert.match(String(lookup?.sql), /LOWER\(TRIM\(email\)\)/);

  const insert = mock.calls.find((call) =>
    call.sql.includes("INSERT INTO teacher_students"),
  );
  assert.ok(insert);
  assert.deepEqual(insert!.params, [2, 1]);
});

test("linkStudentByEmail returns not_found when the email is missing", async () => {
  const mock = makeConnection({ user: null });
  await assert.rejects(
    () =>
      linkStudentByEmail(
        { teacherUserId: 2, email: "nobody@school.ua" },
        { getConnection: async () => mock.connection },
      ),
    (error: unknown) =>
      error instanceof TeacherStudentsError && error.code === "not_found",
  );
  assert.equal(
    mock.calls.some((call) => call.sql.includes("INSERT INTO teacher_students")),
    false,
  );
});

test("linkStudentByEmail rejects a teacher or admin email", async () => {
  const mock = makeConnection({
    user: studentRow({
      id: 2,
      login: "demo-teacher",
      display_name: "Ігор Петренко",
      role: "teacher",
    }),
  });
  await assert.rejects(
    () =>
      linkStudentByEmail(
        { teacherUserId: 3, email: "teacher@school.ua" },
        { getConnection: async () => mock.connection },
      ),
    (error: unknown) =>
      error instanceof TeacherStudentsError && error.code === "not_a_student",
  );
});

test("linkStudentByEmail rejects linking the teacher's own account", async () => {
  const mock = makeConnection({
    user: studentRow({ id: 2, login: "self", role: "student" }),
  });
  await assert.rejects(
    () =>
      linkStudentByEmail(
        { teacherUserId: 2, email: "self@school.ua" },
        { getConnection: async () => mock.connection },
      ),
    (error: unknown) =>
      error instanceof TeacherStudentsError && error.code === "not_a_student",
  );
});

test("linkStudentByEmail returns already_linked for an existing pair", async () => {
  const mock = makeConnection({ user: studentRow(), existing: true });
  await assert.rejects(
    () =>
      linkStudentByEmail(
        { teacherUserId: 2, email: "pupil@school.ua" },
        { getConnection: async () => mock.connection },
      ),
    (error: unknown) =>
      error instanceof TeacherStudentsError && error.code === "already_linked",
  );
});

test("linkStudentByEmail maps a duplicate-key race to already_linked", async () => {
  const mock = makeConnection({ user: studentRow(), duplicate: true });
  await assert.rejects(
    () =>
      linkStudentByEmail(
        { teacherUserId: 2, email: "pupil@school.ua" },
        { getConnection: async () => mock.connection },
      ),
    (error: unknown) =>
      error instanceof TeacherStudentsError && error.code === "already_linked",
  );
});
