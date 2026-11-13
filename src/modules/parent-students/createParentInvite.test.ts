import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import type { SqlConnection } from "@/lib/db/mysql";
import type { AuthUser } from "@/modules/auth/types";
import {
  createParentInvite, PARENT_INVITE_LIMIT, PARENT_INVITE_TTL_MS, PARENT_INVITE_WINDOW_MS,
} from "./createParentInvite";

const NOW = Date.UTC(2026, 10, 13, 12);
const student: AuthUser = { id: 17, role: "student", realRole: "student", login: "test", displayName: "Test" };

function fixture(options: {
  user?: AuthUser | null;
  count?: number;
  storedRole?: string;
  banned?: number;
  missing?: boolean;
  failInsert?: boolean;
} = {}) {
  const calls: { sql: string; params: unknown[] }[] = [];
  const events: string[] = [];
  let count = options.count ?? 0;
  let queue = Promise.resolve();
  let acquisitions = 0;
  const deps = {
    getUser: async () => options.user === undefined ? student : options.user,
    now: () => NOW,
    getConnection: async (): Promise<SqlConnection> => {
      acquisitions++;
      let unlock: (() => void) | undefined;
      let pending = false;
      const finish = () => { unlock?.(); unlock = undefined; };
      return {
        beginTransaction: async () => { events.push("begin"); },
        query: async <T,>(sql: string, params: unknown[] = []): Promise<T[]> => {
          calls.push({ sql, params });
          if (sql.includes("FROM app_users")) {
            const previous = queue;
            queue = new Promise<void>((resolve) => { unlock = resolve; });
            await previous;
            events.push("lock");
            assert.match(sql, /FOR UPDATE/);
            assert.deepEqual(params, [student.id]);
            return (options.missing ? [] : [{ role: options.storedRole ?? "student", is_banned: options.banned ?? 0 }]) as T[];
          }
          assert.match(sql, /FROM parent_invites/);
          assert.deepEqual(params, [student.id, new Date(NOW - PARENT_INVITE_WINDOW_MS)]);
          events.push("count");
          return [{ count: String(count) }] as T[];
        },
        execute: async (sql, params = []) => {
          calls.push({ sql, params });
          events.push("insert");
          if (options.failInsert) throw new Error("database error with private parameters");
          pending = true;
          return { insertId: 1, affectedRows: 1 };
        },
        commit: async () => {
          if (pending) count++;
          events.push("commit");
          finish();
        },
        rollback: async () => { events.push("rollback"); finish(); },
        release: () => { events.push("release"); finish(); },
      };
    },
  };
  return { deps, calls, events, acquisitions: () => acquisitions };
}

test("student receives a 7-day URL; only its token hash and session identity are stored", async () => {
  const f = fixture();
  const result = await createParentInvite(f.deps);
  assert.equal(result.status, "success");
  if (result.status !== "success") return;
  const url = new URL(result.url);
  assert.equal(url.pathname, "/register/parent");
  const token = url.searchParams.get("token")!;
  assert.match(token, /^[A-Za-z0-9_-]{43}$/);
  const insert = f.calls.find((call) => call.sql.includes("INSERT INTO parent_invites"))!;
  assert.deepEqual(insert.params, [
    student.id, student.id, createHash("sha256").update(token).digest("hex"),
    new Date(NOW + PARENT_INVITE_TTL_MS), new Date(NOW),
  ]);
  assert.equal(result.expiresAt, new Date(NOW + 7 * 24 * 60 * 60 * 1000).toISOString());
  assert.ok(!JSON.stringify(f.calls).includes(token));
  assert.deepEqual(f.events, ["begin", "lock", "count", "insert", "commit", "release"]);
});

test("unauthenticated callers cannot acquire a database connection", async () => {
  const f = fixture({ user: null });
  assert.deepEqual(await createParentInvite(f.deps), { status: "error", code: "unauthorized" });
  assert.equal(f.acquisitions(), 0);
});

test("teacher, parent, staff, staff viewing student, and banned users are rejected", async () => {
  const users: AuthUser[] = [
    ...(["teacher", "parent", "admin", "dev"] as const).map((role) => ({ ...student, role, realRole: role })),
    { ...student, realRole: "admin" }, { ...student, isBanned: true },
  ];
  for (const user of users) {
    const f = fixture({ user });
    assert.deepEqual(await createParentInvite(f.deps), { status: "error", code: "forbidden" });
    assert.equal(f.acquisitions(), 0);
  }
});

test("stored role, ban and deleted accounts are rechecked under the lock", async () => {
  for (const options of [{ storedRole: "teacher" }, { banned: 1 }, { missing: true }]) {
    const f = fixture(options);
    assert.deepEqual(await createParentInvite(f.deps), { status: "error", code: "forbidden" });
    assert.deepEqual(f.events, ["begin", "lock", "rollback", "release"]);
  }
});

test("hourly limit rolls back without inserting or returning a link", async () => {
  const f = fixture({ count: PARENT_INVITE_LIMIT });
  assert.deepEqual(await createParentInvite(f.deps), { status: "error", code: "rate_limited" });
  assert.deepEqual(f.events, ["begin", "lock", "count", "rollback", "release"]);
  const query = f.calls.find((call) => call.sql.includes("COUNT(*)"))!.sql;
  assert.ok(!query.includes("used_at") && !query.includes("revoked_at"));
});

test("concurrent issuance cannot both take the last available slot", async () => {
  const f = fixture({ count: PARENT_INVITE_LIMIT - 1 });
  const results = await Promise.all([createParentInvite(f.deps), createParentInvite(f.deps)]);
  assert.equal(results.filter((r) => r.status === "success").length, 1);
  assert.equal(results.filter((r) => r.status === "error" && r.code === "rate_limited").length, 1);
});

test("each invitation uses a fresh random token", async () => {
  const f = fixture();
  const a = await createParentInvite(f.deps);
  const b = await createParentInvite(f.deps);
  assert.ok(a.status === "success" && b.status === "success");
  assert.notEqual(a.url, b.url);
});

test("failed inserts roll back and release without exposing private database errors", async () => {
  const f = fixture({ failInsert: true });
  assert.deepEqual(await createParentInvite(f.deps), { status: "error", code: "generic" });
  assert.deepEqual(f.events, ["begin", "lock", "count", "insert", "rollback", "release"]);
});
