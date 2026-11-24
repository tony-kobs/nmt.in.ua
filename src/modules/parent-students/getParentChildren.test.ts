import assert from "node:assert/strict";
import test from "node:test";
import type { SqlConnection } from "@/lib/db/mysql";
import type { AuthUser } from "@/modules/auth/types";
import { getParentChildren } from "./getParentChildren";
import { requireParentChild } from "./requireParentChild";
import { ParentAccessError, type ParentAccessErrorCode } from "./types";

const parent: AuthUser = { id: 10, role: "parent", realRole: "parent", login: "fixture", displayName: "Parent" };

function fixture() {
  let user: AuthUser | null = parent;
  let liveParent = true;
  const children = [
    { id: 21, display_name: "Child A", role: "student", is_banned: 0, email: "private@example.com" },
    { id: 22, display_name: "Child B", role: "student", is_banned: 0, email: "private2@example.com" },
    { id: 23, display_name: "Other child", role: "student", is_banned: 0, email: "private3@example.com" },
  ];
  const links = new Map([[10, [21, 22]], [11, [23]]]);
  const queries: { sql: string; params: unknown[] }[] = [];
  let connections = 0;
  let releases = 0;
  let queryError: Error | undefined;
  let connectError: Error | undefined;
  const noWrite = async () => { throw new Error("Read must never write"); };
  const connection: SqlConnection = {
    beginTransaction: noWrite, commit: noWrite, rollback: noWrite, execute: noWrite,
    release: () => { releases++; },
    query: async <T,>(sql: string, params: unknown[] = []): Promise<T[]> => {
      queries.push({ sql, params });
      assert.match(sql, /SELECT child.id, child.display_name/);
      assert.match(sql, /ps.parent_user_id = parent.id/);
      assert.match(sql, /child.id = ps.student_user_id/);
      assert.match(sql, /child.role = 'student' AND child.is_banned = 0/);
      assert.match(sql, /parent.id = \? AND parent.role = 'parent' AND parent.is_banned = 0/);
      assert.match(sql, /ORDER BY child.display_name ASC, child.id ASC/);
      assert.ok(!sql.includes("email"));
      if (queryError) throw queryError;
      if (!liveParent) return [];
      const targeted = sql.includes("AND ps.student_user_id = ?");
      const parentId = params[targeted ? 1 : 0] as number;
      const rows = children.filter((child) => (links.get(parentId) ?? []).includes(child.id)
        && child.role === "student" && child.is_banned === 0 && (!targeted || child.id === params[0]));
      // Simulate LEFT JOIN's parent-only row when no child matches.
      return (rows.length ? rows : [{ id: null, display_name: null }]) as T[];
    },
  };
  const deps = {
    getUser: async () => user,
    getConnection: async () => {
      connections++;
      if (connectError) throw connectError;
      return connection;
    },
  };
  return { deps, children, links, queries,
    setUser: (value: AuthUser | null) => { user = value; },
    setLiveParent: (value: boolean) => { liveParent = value; },
    failQuery: (error: Error) => { queryError = error; },
    failConnection: (error: Error) => { connectError = error; },
    connections: () => connections, releases: () => releases };
}

const denied = (code: ParentAccessErrorCode) => (error: unknown) =>
  error instanceof ParentAccessError && error.code === code;

test("parent sees multiple own children with only id and displayName", async () => {
  const f = fixture();
  assert.deepEqual(await getParentChildren(f.deps), [{ id: 21, displayName: "Child A" }, { id: 22, displayName: "Child B" }]);
  assert.deepEqual(f.queries[0].params, [parent.id]);
  assert.equal(f.releases(), 1);
});

test("a different parent receives only their own children", async () => {
  const f = fixture(); f.setUser({ ...parent, id: 11 });
  assert.deepEqual(await getParentChildren(f.deps), [{ id: 23, displayName: "Other child" }]);
  assert.deepEqual(f.queries[0].params, [11]);
});

test("parent with no children gets an empty list", async () => {
  const f = fixture(); f.links.set(10, []);
  assert.deepEqual(await getParentChildren(f.deps), []);
  assert.equal(f.releases(), 1);
});

test("requireParentChild scopes the query to session parent and returns minimal identity", async () => {
  const f = fixture();
  assert.deepEqual(await requireParentChild(21, f.deps), { id: 21, displayName: "Child A" });
  assert.deepEqual(f.queries[0].params, [21, parent.id]);
});

test("foreign and nonexistent children have the same safe error", async () => {
  const f = fixture();
  for (const id of [23, 999]) await assert.rejects(requireParentChild(id, f.deps), denied("not_found"));
});

test("removed link revokes access on the very next call", async () => {
  const f = fixture();
  await requireParentChild(21, f.deps);
  f.links.set(10, [22]);
  await assert.rejects(requireParentChild(21, f.deps), denied("not_found"));
  assert.deepEqual(await getParentChildren(f.deps), [{ id: 22, displayName: "Child B" }]);
});

test("deleted, banned and changed-role children are unavailable without exposing why", async () => {
  for (const mode of ["deleted", "banned", "role"] as const) {
    const f = fixture();
    if (mode === "deleted") f.children.splice(0, 1);
    if (mode === "banned") f.children[0].is_banned = 1;
    if (mode === "role") f.children[0].role = "teacher";
    await assert.rejects(requireParentChild(21, f.deps), denied("not_found"));
    assert.deepEqual(await getParentChildren(f.deps), [{ id: 22, displayName: "Child B" }]);
  }
});

test("missing session and all non-parent roles are rejected before querying children", async () => {
  for (const user of [null, ...(["student", "teacher", "admin", "dev"] as const).map((role) => ({ ...parent, role, realRole: role })),
    { ...parent, isBanned: true }, { ...parent, realRole: "admin" as const }]) {
    const f = fixture(); f.setUser(user);
    const code = user ? "forbidden" : "unauthorized";
    await assert.rejects(getParentChildren(f.deps), denied(code));
    await assert.rejects(requireParentChild(21, f.deps), denied(code));
    assert.equal(f.connections(), 0);
  }
});

test("fresh SQL account check rejects a parent whose role or ban changed after session read", async () => {
  const f = fixture(); f.setLiveParent(false);
  await assert.rejects(getParentChildren(f.deps), denied("forbidden"));
  await assert.rejects(requireParentChild(21, f.deps), denied("forbidden"));
  assert.equal(f.releases(), 2);
});

test("invalid target ids get not_found without acquiring a connection", async () => {
  const f = fixture();
  for (const id of [undefined, null, 0, -1, 1.5, NaN, Infinity, "21", {}, { parentId: 11, childId: 23 }]) {
    await assert.rejects(requireParentChild(id, f.deps), denied("not_found"));
  }
  assert.equal(f.connections(), 0);
});

test("database query errors propagate and always release the connection", async () => {
  const f = fixture(); const error = new Error("test query failure"); f.failQuery(error);
  for (const call of [() => getParentChildren(f.deps), () => requireParentChild(21, f.deps)]) {
    await assert.rejects(call, (actual) => actual === error);
  }
  assert.equal(f.releases(), 2);
});

test("connection and session read failures propagate without becoming empty lists", async () => {
  const f = fixture(); const error = new Error("test connection failure"); f.failConnection(error);
  await assert.rejects(getParentChildren(f.deps), (actual) => actual === error);
  await assert.rejects(requireParentChild(21, f.deps), (actual) => actual === error);
  assert.equal(f.releases(), 0);
  const deps = { ...f.deps, getUser: async () => { throw error; } };
  await assert.rejects(getParentChildren(deps), (actual) => actual === error);
});
