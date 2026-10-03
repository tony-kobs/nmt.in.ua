import assert from "node:assert/strict";
import { test } from "node:test";
import type { SqlConnection } from "@/lib/db/mysql";
import { getLinkedUserByTelegramId, getTelegramTaskSessions, TELEGRAM_TASK_SESSIONS_LIMIT } from "./tasks";

const now = 1_800_000_000;
type Session = {
  id: number; user_id: number; session_type: number; theme_id: number | null;
  theme_name: string | null; session_status: number; tasks_number: number;
  expire_time: number | null; right_number: number; time: number;
  available_at?: number; due_at?: number; cancelled?: boolean;
};
function session(id: number, overrides: Partial<Session> = {}): Session {
  return { id, user_id: 7, session_type: 1, theme_id: 4, theme_name: " Algebra ", session_status: 2, tasks_number: 10, expire_time: now + 100, right_number: 0, time: 0, ...overrides };
}

function database(sessions: Session[] = []) {
  const links = new Map([["123", { user_id: 7, banned: false }], ["456", { user_id: 8, banned: false }]]);
  const mappings: { session_id: number; user_id: number; status: number }[] = [];
  const calls: { sql: string; params: unknown[] }[] = [];
  let released = 0;
  let failure: Error | undefined;
  const logs: unknown[] = [];
  const connection: SqlConnection = {
    beginTransaction: async () => { assert.fail("read API must not start a write transaction"); },
    commit: async () => { assert.fail("unexpected commit"); },
    rollback: async () => { assert.fail("unexpected rollback"); },
    execute: async () => { assert.fail("read API must not execute writes or schema creation"); },
    release: () => { released++; },
    query: async <T>(sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (failure) throw failure;
      assert.match(sql, /uta\.telegram_user_id = \?/);
      assert.match(sql, /u\.is_banned = 0/);
      const link = links.get(String(params.at(-1)));
      if (!link || link.banned) return [];
      if (!sql.includes("task_sessions")) return [{ user_id: link.user_id, password: "hidden" }] as T[];
      assert.match(sql, /LEFT JOIN task_sessions ts ON ts\.user_id = uta\.user_id/);
      assert.equal((sql.match(/m\.user_id = uta\.user_id/g) ?? []).length, 2);
      assert.match(sql, /ts\.session_status IN \(\?, \?\)/);
      assert.match(sql, /ts\.expire_time > \?/);
      assert.match(sql, /NOT \(ts\.tasks_number > 0 AND ts\.right_number >= ts\.tasks_number AND ts\.time > 0\)/);
      assert.match(sql, /mam\.student_user_id = uta\.user_id/);
      assert.match(sql, /ma\.status = 'cancelled' OR ma\.available_at > \? OR ma\.due_at <= \?/);
      assert.match(sql, /LEFT JOIN themes/);
      assert.match(sql, /ORDER BY ts\.id DESC/);
      assert.match(sql, /LIMIT 50\s*$/);
      assert.doesNotMatch(sql, /right_answer|quiz_tasks|SELECT\s+\*/i);
      assert.deepEqual(params.slice(0, -1), [1, -1, 2, 3, now, now, now]);
      const current = sessions.filter((s) => s.user_id === link.user_id && [2, 3].includes(s.session_status) && s.expire_time != null && s.expire_time > now && !(s.tasks_number > 0 && s.right_number >= s.tasks_number && s.time > 0) && !s.cancelled && (s.available_at ?? now) <= now && (s.due_at ?? now + 1) > now).sort((a, b) => b.id - a.id).slice(0, 50);
      return (current.length ? current.map((s) => {
        const ownMappings = mappings.filter((m) => m.session_id === s.id && m.user_id === link.user_id);
        return { ...s, mapping_count: ownMappings.length, answered_count: ownMappings.filter((m) => [1, -1].includes(m.status)).length, right_answer_n: 4, password: "hidden" };
      }) : [{ user_id: link.user_id, id: null }]) as T[];
    },
  };
  return { links, mappings, calls, logs, connection, get released() { return released; }, fail: (error: Error) => { failure = error; }, deps: { getConnection: async () => connection, nowSec: () => now, logError: (error: unknown) => { logs.push(error); } } };
}

test("linked identity resolves to a minimal user DTO and never trusts an app user id", async () => {
  const db = database();
  assert.deepEqual(await getLinkedUserByTelegramId("123", db.deps), { status: "success", user: { userId: 7 } });
  assert.deepEqual(await getLinkedUserByTelegramId(123, db.deps), { status: "success", user: { userId: 7 } });
  assert.deepEqual(await getLinkedUserByTelegramId(7, db.deps), { status: "error", code: "notLinked" });
  assert.equal(db.released, 3);
});

test("invalid identity is rejected before acquiring a connection", async () => {
  const db = database();
  for (const id of [null, undefined, {}, { userId: 7 }, "", "0", "-1", "01", " 123", "123\n", "1 OR 1=1", "9007199254740992", 0, -1, 1.5, NaN, Infinity, 9007199254740992]) {
    assert.deepEqual(await getLinkedUserByTelegramId(id, db.deps), { status: "error", code: "invalidIdentity" });
    assert.deepEqual(await getTelegramTaskSessions(id, db.deps), { status: "error", code: "invalidIdentity" });
  }
  assert.equal(db.calls.length, 0);
  assert.equal(db.released, 0);
});

test("unlinked or banned accounts return no student data; linked empty account succeeds", async () => {
  const db = database([session(1)]);
  assert.deepEqual(await getTelegramTaskSessions("789", db.deps), { status: "error", code: "notLinked" });
  db.links.get("123")!.banned = true;
  assert.deepEqual(await getTelegramTaskSessions("123", db.deps), { status: "error", code: "notLinked" });
  assert.deepEqual(await getLinkedUserByTelegramId("123", db.deps), { status: "error", code: "notLinked" });
  assert.deepEqual(await getTelegramTaskSessions("456", db.deps), { status: "success", sessions: [] });
});

test("ownership scopes sessions and answer counts, with no hidden fields in DTO", async () => {
  const db = database([session(1), session(2, { user_id: 8, theme_id: null, theme_name: null, session_type: 4 })]);
  db.mappings.push({ session_id: 1, user_id: 7, status: 1 }, { session_id: 1, user_id: 7, status: -1 }, { session_id: 1, user_id: 7, status: 0 }, { session_id: 1, user_id: 8, status: 1 });
  assert.deepEqual(await getTelegramTaskSessions("123", db.deps), { status: "success", sessions: [{ sessionId: 1, sessionType: 1, themeId: 4, themeName: "Algebra", status: 2, taskCount: 3, completedTaskCount: 2, expiresAt: now + 100 }] });
  assert.deepEqual(await getTelegramTaskSessions("456", db.deps), { status: "success", sessions: [{ sessionId: 2, sessionType: 4, themeId: null, themeName: null, status: 2, taskCount: 10, completedTaskCount: 0, expiresAt: now + 100 }] });
  assert.equal(db.calls.length, 2);
});

test("only current created/planned work is returned, including planned rows without mappings", async () => {
  const db = database([
    session(1), session(2, { session_status: 3, session_type: 3, available_at: now, due_at: now + 50 }),
    session(3, { session_status: 1 }), session(4, { expire_time: now }), session(5, { expire_time: null }),
    session(6, { expire_time: 0 }), session(7, { available_at: now + 1 }), session(8, { cancelled: true }),
    session(9, { right_number: 10, time: 20 }), session(10, { session_status: 99 }), session(11, { due_at: now }),
  ]);
  const result = await getTelegramTaskSessions("123", db.deps);
  assert.equal(result.status, "success");
  if (result.status !== "success") assert.fail();
  assert.deepEqual(result.sessions.map((s) => s.sessionId), [2, 1]);
  assert.equal(result.sessions[0].taskCount, 10);
  assert.equal(result.sessions[0].completedTaskCount, 0);
});

test("newest-first ordering is deterministic and capped at 50 in the database", async () => {
  assert.equal(TELEGRAM_TASK_SESSIONS_LIMIT, 50);
  const db = database(Array.from({ length: 70 }, (_, i) => session(i + 1)));
  const result = await getTelegramTaskSessions("123", db.deps);
  if (result.status !== "success") assert.fail();
  assert.deepEqual(result.sessions.map((s) => s.sessionId), Array.from({ length: 50 }, (_, i) => 70 - i));
  assert.deepEqual(await getTelegramTaskSessions("123", db.deps), result);
});

test("connection and query failures use a safe contract, log context and release acquired connections", async () => {
  const error = new Error("secret SQL host credentials");
  for (const service of [getLinkedUserByTelegramId, getTelegramTaskSessions]) {
    const db = database();
    db.fail(error);
    assert.deepEqual(await service("123", db.deps), { status: "error", code: "databaseFailure" });
    assert.equal(db.released, 1);
    assert.deepEqual(db.logs, [error]);
    assert.deepEqual(await service("123", { ...db.deps, getConnection: async () => { throw error; } }), { status: "error", code: "databaseFailure" });
    assert.equal(db.released, 1);
  }
});
