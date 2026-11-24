import assert from "node:assert/strict";
import test from "node:test";
import type { SqlConnection } from "@/lib/db/mysql";
import type { AuthUser } from "@/modules/auth/types";
import { getParentChildren } from "./getParentChildren";
import { listLinkedParents, unlinkParent } from "./unlinkParent";

const student: AuthUser = { id: 21, role: "student", realRole: "student", login: "olenka", displayName: "Оленка" };
const parent: AuthUser = { id: 10, role: "parent", realRole: "parent", login: "mama", displayName: "Мама" };

test("a student lists only their parents and unlinks with the session id", async () => {
  const links = new Map<string, string>([["10:21", "Мама"], ["11:21", "Тато"], ["10:99", "Чужа"]]);
  let released = 0;
  const connection = (): SqlConnection => ({
    beginTransaction: async () => { throw new Error("no transaction"); },
    commit: async () => { throw new Error("no commit"); },
    rollback: async () => { throw new Error("no rollback"); },
    release: () => { released++; },
    query: async <T,>(sql: string, params: unknown[] = []): Promise<T[]> => {
      assert.deepEqual(params, [student.id]);
      assert.match(sql, /ps.student_user_id = \?/);
      assert.ok(!sql.includes("email"));
      return [...links.entries()].flatMap(([key, name]) => {
        const [parentId, studentId] = key.split(":").map(Number);
        if (studentId !== student.id) return [];
        return [{ id: parentId, display_name: name }];
      }) as T[];
    },
    execute: async (sql, params = []) => {
      assert.match(sql, /DELETE/);
      assert.deepEqual(params, [student.id, 10]);
      const removed = links.delete("10:21");
      return { insertId: 0, affectedRows: removed ? 1 : 0 };
    },
  });
  const deps = { getUser: async () => student, getConnection: async () => connection() };
  assert.deepEqual(await listLinkedParents(deps), [
    { id: 10, displayName: "Мама" },
    { id: 11, displayName: "Тато" },
  ]);
  assert.deepEqual(await unlinkParent(10, deps), { status: "ok" });
  assert.equal(links.has("10:21"), false);
  assert.equal(links.has("10:99"), true);
  assert.deepEqual(await listLinkedParents(deps), [{ id: 11, displayName: "Тато" }]);
  assert.ok(released >= 3);
});

test("unlinking drops the child from the next parent read", async () => {
  let linked = true;
  const parentDeps = {
    getUser: async () => parent,
    getConnection: async (): Promise<SqlConnection> => ({
      beginTransaction: async () => undefined,
      commit: async () => undefined,
      rollback: async () => undefined,
      release: () => undefined,
      execute: async () => { throw new Error("parent read must not write"); },
      query: async <T,>(): Promise<T[]> => (linked
        ? [{ id: 21, display_name: "Оленка" }]
        : [{ id: null, display_name: null }]) as T[],
    }),
  };
  const studentDeps = {
    getUser: async () => student,
    getConnection: async (): Promise<SqlConnection> => ({
      beginTransaction: async () => undefined,
      commit: async () => undefined,
      rollback: async () => undefined,
      release: () => undefined,
      query: async () => [],
      execute: async () => {
        linked = false;
        return { insertId: 0, affectedRows: 1 };
      },
    }),
  };
  assert.equal((await getParentChildren(parentDeps))[0]?.id, 21);
  assert.deepEqual(await unlinkParent(10, studentDeps), { status: "ok" });
  assert.deepEqual(await getParentChildren(parentDeps), []);
});

test("a parent cannot unlink, and a student cannot remove someone else's link", async () => {
  let writes = 0;
  const connection = (): SqlConnection => ({
    beginTransaction: async () => undefined,
    commit: async () => undefined,
    rollback: async () => undefined,
    release: () => undefined,
    query: async () => [],
    execute: async () => { writes++; return { insertId: 0, affectedRows: 0 }; },
  });
  const asParent = { getUser: async () => parent, getConnection: async () => connection() };
  assert.deepEqual(await unlinkParent(10, asParent), { status: "error", code: "forbidden" });
  assert.deepEqual(await listLinkedParents(asParent), []);
  const asStudent = { getUser: async () => student, getConnection: async () => connection() };
  assert.deepEqual(await unlinkParent(99, asStudent), { status: "error", code: "notFound" });
  assert.deepEqual(await unlinkParent("10", asStudent), { status: "error", code: "notFound" });
  assert.equal(writes, 1);
});

test("signed-out unlink does not touch the database", async () => {
  let acquired = false;
  const deps = {
    getUser: async () => null,
    getConnection: async () => { acquired = true; throw new Error("must not connect"); },
  };
  assert.deepEqual(await unlinkParent(10, deps), { status: "error", code: "unauthorized" });
  assert.equal(acquired, false);
});
