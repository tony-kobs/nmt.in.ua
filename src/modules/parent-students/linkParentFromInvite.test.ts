import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";
import type { SqlConnection } from "@/lib/db/mysql";
import { hashAuthToken } from "@/modules/auth/authTokens";
import type { AuthUser } from "@/modules/auth/types";
import { linkParentFromInvite } from "./linkParentFromInvite";

const token = randomBytes(32).toString("base64url");
const parent: AuthUser = { id: 10, role: "parent", realRole: "parent", login: "mama", displayName: "Мама" };

function fixture(options: {
  user?: AuthUser | null;
  missing?: boolean;
  used?: boolean;
  revoked?: boolean;
  expired?: boolean;
  parentRole?: string;
  studentRole?: string;
  bannedParent?: boolean;
  duplicate?: boolean;
  consume?: boolean;
} = {}) {
  const events: string[] = [];
  const links: unknown[][] = [];
  let used = options.used ?? false;
  const user = options.user === undefined ? parent : options.user;
  const deps = {
    getUser: async () => user,
    getConnection: async (): Promise<SqlConnection> => ({
      beginTransaction: async () => { events.push("begin"); },
      query: async <T,>(sql: string, params: unknown[] = []): Promise<T[]> => {
        if (sql.includes("FROM parent_invites") && !sql.includes("FOR UPDATE")) {
          assert.deepEqual(params, [hashAuthToken(token)]);
          return (options.missing ? [] : [{ student_user_id: 17 }]) as T[];
        }
        if (sql.includes("FROM app_users")) {
          assert.match(sql, /FOR UPDATE/);
          const id = params[0];
          events.push(`lock:${id}`);
          if (id === 10) {
            return [{ role: options.parentRole ?? "parent", is_banned: options.bannedParent ? 1 : 0 }] as T[];
          }
          assert.equal(id, 17);
          return [{ role: options.studentRole ?? "student", is_banned: 0 }] as T[];
        }
        assert.match(sql, /FOR UPDATE/);
        assert.ok(events.includes("lock:10") && events.includes("lock:17"));
        return [{
          id: 29, student_user_id: 17, used_at: used ? "used" : null,
          revoked_at: options.revoked ? "revoked" : null, unexpired: options.expired ? 0 : 1,
        }] as T[];
      },
      execute: async (sql, params = []) => {
        if (sql.includes("INSERT INTO parent_students")) {
          assert.deepEqual(params, [10, 17]);
          if (options.duplicate) throw { errno: 1062 };
          links.push(params);
          events.push("link");
          return { insertId: 0, affectedRows: 1 };
        }
        assert.match(sql, /UPDATE parent_invites/);
        assert.deepEqual(params, [10, 29]);
        if (options.consume === false) return { insertId: 0, affectedRows: 0 };
        used = true;
        events.push("consume");
        return { insertId: 0, affectedRows: 1 };
      },
      commit: async () => { events.push("commit"); },
      rollback: async () => { events.push("rollback"); },
      release: () => { events.push("release"); },
    }),
  };
  return { deps, events, links, used: () => used };
}

test("an existing parent accepts an invite without a second account", async () => {
  const f = fixture();
  assert.deepEqual(await linkParentFromInvite(token, f.deps), { status: "linked" });
  assert.deepEqual(f.links, [[10, 17]]);
  assert.deepEqual(f.events.filter((event) => event.startsWith("lock")), ["lock:10", "lock:17"]);
  assert.ok(f.events.includes("consume") && f.events.includes("commit"));
  assert.equal(f.used(), true);
});

test("a second accept of the same child still consumes the one-time token", async () => {
  const f = fixture({ duplicate: true });
  assert.deepEqual(await linkParentFromInvite(token, f.deps), { status: "already" });
  assert.equal(f.links.length, 0);
  assert.ok(f.events.includes("consume"));
});

test("students, teachers and signed-out visitors cannot attach the invite", async () => {
  for (const user of [null, { ...parent, role: "student" as const, realRole: "student" as const },
    { ...parent, role: "teacher" as const, realRole: "teacher" as const },
    { ...parent, realRole: "admin" as const }, { ...parent, isBanned: true }]) {
    const f = fixture({ user });
    const code = user ? "forbidden" : "unauthorized";
    assert.deepEqual(await linkParentFromInvite(token, f.deps), { status: "error", code });
    assert.equal(f.events.length, 0);
  }
});

test("used, revoked, expired and wrong-role invitations are rejected", async () => {
  for (const options of [{ used: true }, { revoked: true }, { expired: true }, { studentRole: "teacher" }, { parentRole: "student" }, { bannedParent: true }, { missing: true }]) {
    const f = fixture(options);
    const code = options.studentRole || options.parentRole || options.bannedParent ? "forbidden" : "invalidInvite";
    assert.deepEqual(await linkParentFromInvite(token, f.deps), { status: "error", code });
    assert.equal(f.links.length, 0);
    assert.equal(f.used(), Boolean(options.used));
  }
});

test("a failed consume rolls back and does not report success", async () => {
  const f = fixture({ consume: false });
  assert.deepEqual(await linkParentFromInvite(token, f.deps), { status: "error", code: "serverError" });
  assert.ok(f.events.includes("rollback"));
  assert.equal(f.used(), false);
});
