import assert from "node:assert/strict";
import test from "node:test";
import type { SqlConnection } from "@/lib/db/mysql";
import { unlinkStudent, validateUnlinkStudentInput } from "./unlinkStudent";
import { TeacherStudentsError } from "./types";

function makeConnection(options: { affectedRows?: number } = {}) {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const connection: SqlConnection = {
    beginTransaction: async () => {},
    query: async () => [],
    execute: async (sql, params = []) => {
      calls.push({ sql, params });
      if (sql.includes("CREATE TABLE")) {
        return { insertId: 0, affectedRows: 0 };
      }
      if (sql.includes("DELETE FROM teacher_students")) {
        return { insertId: 0, affectedRows: options.affectedRows ?? 1 };
      }
      return { insertId: 0, affectedRows: 0 };
    },
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  };
  return { connection, calls };
}

test("validateUnlinkStudentInput requires two distinct positive ids", () => {
  assert.deepEqual(
    validateUnlinkStudentInput({ teacherUserId: 2, studentUserId: 1 }),
    { teacherUserId: 2, studentUserId: 1 },
  );

  assert.throws(
    () => validateUnlinkStudentInput({ teacherUserId: 2, studentUserId: 2 }),
    (error: unknown) =>
      error instanceof TeacherStudentsError && error.code === "invalid_input",
  );
  assert.throws(
    () => validateUnlinkStudentInput({ teacherUserId: 2, studentUserId: 0 }),
    (error: unknown) =>
      error instanceof TeacherStudentsError && error.code === "invalid_input",
  );
});

test("unlinkStudent deletes only the session teacher's pair", async () => {
  const mock = makeConnection({ affectedRows: 1 });
  await unlinkStudent(
    { teacherUserId: 2, studentUserId: 1 },
    { getConnection: async () => mock.connection },
  );

  const del = mock.calls.find((call) =>
    call.sql.includes("DELETE FROM teacher_students"),
  );
  assert.ok(del);
  assert.deepEqual(del!.params, [2, 1]);
});

test("unlinkStudent returns not_found when the pair is missing", async () => {
  const mock = makeConnection({ affectedRows: 0 });
  await assert.rejects(
    () =>
      unlinkStudent(
        { teacherUserId: 2, studentUserId: 99 },
        { getConnection: async () => mock.connection },
      ),
    (error: unknown) =>
      error instanceof TeacherStudentsError && error.code === "not_found",
  );
});
