import assert from "node:assert/strict";
import test from "node:test";
import type { SqlConnection } from "@/lib/db/mysql";
import { getTeacherStudents } from "./getTeacherStudents";
import { TeacherStudentsError } from "./types";

function makeConnection() {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const connection: SqlConnection = {
    beginTransaction: async () => {},
    query: async <T,>(sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes("FROM teacher_students")) {
        return [
          {
            id: 1,
            login: "demo-student",
            display_name: "  Олена Коваленко ",
            created_at: new Date("2026-09-11T10:00:00.000Z"),
          },
        ] as T[];
      }
      return [] as T[];
    },
    execute: async (sql, params = []) => {
      calls.push({ sql, params });
      return { insertId: 0, affectedRows: 0 };
    },
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  };
  return { connection, calls };
}

test("getTeacherStudents lists linked students for the session teacher", async () => {
  const mock = makeConnection();
  const rows = await getTeacherStudents(2, {
    getConnection: async () => mock.connection,
  });

  assert.equal(rows.length, 1);
  assert.deepEqual(
    {
      studentUserId: rows[0]!.studentUserId,
      login: rows[0]!.login,
      displayName: rows[0]!.displayName,
    },
    {
      studentUserId: 1,
      login: "demo-student",
      displayName: "Олена Коваленко",
    },
  );
  const list = mock.calls.find((call) =>
    call.sql.includes("FROM teacher_students"),
  );
  assert.ok(list);
  assert.deepEqual(list!.params, [2]);
});

test("getTeacherStudents rejects a non-positive teacher id", async () => {
  await assert.rejects(
    () => getTeacherStudents(0),
    (error: unknown) =>
      error instanceof TeacherStudentsError && error.code === "invalid_input",
  );
});
