import assert from "node:assert/strict";
import { test } from "node:test";
import type { SqlConnection } from "@/lib/db/mysql";
import { getLinkedUserByTelegramId, getTelegramTaskSessions, getTelegramTodayTaskSessions, TELEGRAM_TASK_SESSIONS_LIMIT } from "./tasks";
import { handleTelegramUpdate } from "./webhook";
import { formatTelegramTasks } from "./taskCommands";

import { getTelegramTaskDayInterval } from "./taskDay";

const now = 1_800_000_000;

test("today queries its own interval before ordering, independent of the tasks limit", async () => {
  const { endSec } = getTelegramTaskDayInterval(now);
  const db = database([
    session(1), session(2, { session_status: 3 }),
    session(3, { user_id: 8 }), session(4, { session_status: 1 }), session(5, { session_status: 99 }),
    ...Array.from({ length: 60 }, (_, i) => session(i + 10, { expire_time: endSec + 100 })),
  ]);
  const tasks = await getTelegramTaskSessions("123", db.deps);
  assert.equal(tasks.status, "success");
  if (tasks.status !== "success") assert.fail();
  assert.equal(tasks.sessions.length, 50);
  assert.ok(tasks.sessions.every((s) => s.sessionId >= 10));
  const today = await getTelegramTodayTaskSessions("123", db.deps);
  if (today.status !== "success") assert.fail();
  assert.deepEqual(today.sessions.map((s) => s.sessionId), [2, 1]);
  const many = database(Array.from({ length: 60 }, (_, i) => session(i + 1)));
  const allToday = await getTelegramTodayTaskSessions("123", many.deps);
  if (allToday.status !== "success") assert.fail();
  assert.equal(allToday.sessions.length, 60);
});

test("Kyiv calendar uses UTC instants and handles 23/25-hour DST days", () => {
  for (const [instant, start, end] of [
    ["2026-10-02T22:30:00Z", "2026-10-02T21:00:00Z", "2026-10-03T21:00:00Z"],
    ["2026-03-29T10:00:00Z", "2026-03-28T22:00:00Z", "2026-03-29T21:00:00Z"],
    ["2026-10-25T10:00:00Z", "2026-10-24T21:00:00Z", "2026-10-25T22:00:00Z"],
  ]) {
    assert.deepEqual(getTelegramTaskDayInterval(Date.parse(instant) / 1000), {
      startSec: Date.parse(start) / 1000, endSec: Date.parse(end) / 1000,
    });
  }
});

test("task calendar and deadline display are independent of the host timezone", () => {
  const previous = process.env.TZ;
  try {
    const results = ["UTC", "Pacific/Honolulu", "Asia/Tokyo"].map((zone) => {
      process.env.TZ = zone;
      return {
        interval: getTelegramTaskDayInterval(Date.parse("2026-10-02T22:30:00Z") / 1000),
        text: formatTelegramTasks([{ sessionId: 1, sessionType: 1, themeId: null, themeName: null, status: 2, taskCount: 1, completedTaskCount: 0, expiresAt: Date.parse("2026-10-02T22:30:00Z") / 1000 }], true),
      };
    });
    assert.deepEqual(results[0], results[1]);
    assert.deepEqual(results[0], results[2]);
    assert.match(results[0].text, /03\.10\.2026.*01:30/);
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});

test("SQL day boundaries are inclusive/exclusive without weakening expiry", async () => {
  const { startSec, endSec } = getTelegramTaskDayInterval(now);
  const db = database([session(1, { expire_time: startSec }), session(2, { expire_time: startSec - 1 }), session(3, { expire_time: endSec - 1 }), session(4, { expire_time: endSec })], startSec);
  const result = await getTelegramTodayTaskSessions("123", db.deps);
  if (result.status !== "success") assert.fail();
  assert.deepEqual(result.sessions.map((s) => s.sessionId), [3]);
  assert.equal(db.calls[0].params[5], startSec);
  assert.equal(db.calls[0].params[6], endSec);
});

function update(text: string, id = 123) {
  return { message: { chat: { id, type: "private" }, from: { id }, text } };
}

test("task commands use the real service with owned tasks and safe empty states", async () => {
  const db = database([session(1), session(2, { user_id: 8, theme_name: "Private geometry" })]);
  const deps = { consume: async () => false, getTasks: (id: unknown) => getTelegramTaskSessions(id, db.deps), getTodayTasks: (id: unknown) => getTelegramTodayTaskSessions(id, db.deps) };
  for (const command of ["/tasks", "/today", "/tasks@example_bot", "/today@example_bot"]) {
    const reply = await handleTelegramUpdate(update(command), deps);
    assert.equal(reply?.chatId, "123");
    assert.match(reply!.text, /Algebra/);
    assert.doesNotMatch(reply!.text, /Private geometry|sessionId|themeId/);
  }
  const empty = database();
  const emptyDeps = { ...deps, getTasks: (id: unknown) => getTelegramTaskSessions(id, empty.deps), getTodayTasks: (id: unknown) => getTelegramTodayTaskSessions(id, empty.deps) };
  assert.match((await handleTelegramUpdate(update("/tasks"), emptyDeps))!.text, /немає актуальних/);
  assert.match((await handleTelegramUpdate(update("/today"), emptyDeps))!.text, /На сьогодні завдань немає/);
  const tomorrow = database([session(3, { expire_time: now + 86400 })]);
  assert.match((await handleTelegramUpdate(update("/today"), { ...deps, getTodayTasks: (id: unknown) => getTelegramTodayTaskSessions(id, tomorrow.deps) }))!.text, /На сьогодні завдань немає/);
});

test("both task commands reject unlinked identities and safely report logged storage failures", async () => {
  const db = database([session(1)]);
  const deps = { consume: async () => false, getTasks: (id: unknown) => getTelegramTaskSessions(id, db.deps), getTodayTasks: (id: unknown) => getTelegramTodayTaskSessions(id, db.deps) };
  for (const command of ["/tasks", "/today"]) {
    const reply = await handleTelegramUpdate(update(command, 789), deps);
    assert.match(reply!.text, /Спочатку підключіть Telegram/);
    assert.doesNotMatch(reply!.text, /Algebra/);
  }
  const error = new Error("private SQL credentials");
  db.fail(error);
  for (const command of ["/tasks", "/today"]) {
    const reply = await handleTelegramUpdate(update(command), deps);
    assert.equal(reply!.text, "Не вдалося отримати завдання. Спробуйте пізніше.");
  }
  assert.deepEqual(db.logs, [error, error]);
});

test("invalid task updates and unsupported commands never retrieve tasks", async () => {
  const db = database();
  const deps = { consume: async () => false, getTasks: (id: unknown) => getTelegramTaskSessions(id, db.deps), getTodayTasks: (id: unknown) => getTelegramTodayTaskSessions(id, db.deps) };
  for (const invalid of [null, {}, update("/done"), update("/tasks 7"), update("/today", -1),
    { message: { ...update("/tasks").message, chat: { id: 123, type: "group" } } },
    { message: { ...update("/tasks").message, from: { id: 456 } } }]) {
    assert.equal(await handleTelegramUpdate(invalid, deps), null);
  }
  assert.equal(db.calls.length, 0);
});

test("replies fit Telegram text limit", () => {
  const sessions = [{ sessionId: 1, sessionType: 1, themeId: null, themeName: "Algebra", status: 3, taskCount: 10, completedTaskCount: 0, expiresAt: now + 100 }];
  const text = formatTelegramTasks(Array.from({ length: 50 }, () => ({ ...sessions[0], themeName: "😀".repeat(200) })), false);
  assert.ok(text.length <= 4096);
  assert.match(text, /Решта завдань/);
});
type Session = {
  id: number; user_id: number; session_type: number; theme_id: number | null;
  theme_name: string | null; session_status: number; tasks_number: number;
  expire_time: number | null; right_number: number; time: number;
  available_at?: number; due_at?: number; cancelled?: boolean;
};
function session(id: number, overrides: Partial<Session> = {}): Session {
  return { id, user_id: 7, session_type: 1, theme_id: 4, theme_name: " Algebra ", session_status: 2, tasks_number: 10, expire_time: now + 100, right_number: 0, time: 0, ...overrides };
}

function database(sessions: Session[] = [], fixtureNow = now) {
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
      const today = sql.includes("ts.expire_time >= ?");
      if (today) {
        assert.match(sql, /ts\.expire_time >= \? AND ts\.expire_time < \?/);
        assert.doesNotMatch(sql, /LIMIT/);
      } else assert.match(sql, /LIMIT 50\s*$/);
      assert.doesNotMatch(sql, /right_answer|quiz_tasks|SELECT\s+\*/i);
      const interval = getTelegramTaskDayInterval(fixtureNow);
      assert.deepEqual(params.slice(0, -1), [1, -1, 2, 3, fixtureNow, ...(today ? [interval.startSec, interval.endSec] : []), fixtureNow, fixtureNow]);
      const current = sessions.filter((s) => s.user_id === link.user_id && [2, 3].includes(s.session_status) && s.expire_time != null && s.expire_time > fixtureNow && !(s.tasks_number > 0 && s.right_number >= s.tasks_number && s.time > 0) && !s.cancelled && (s.available_at ?? fixtureNow) <= fixtureNow && (s.due_at ?? fixtureNow + 1) > fixtureNow).filter((s) => !today || (s.expire_time! >= Number(params[5]) && s.expire_time! < Number(params[6]))).sort((a, b) => b.id - a.id).slice(0, today ? undefined : 50);
      return (current.length ? current.map((s) => {
        const ownMappings = mappings.filter((m) => m.session_id === s.id && m.user_id === link.user_id);
        return { ...s, mapping_count: ownMappings.length, answered_count: ownMappings.filter((m) => [1, -1].includes(m.status)).length, right_answer_n: 4, password: "hidden" };
      }) : [{ user_id: link.user_id, id: null }]) as T[];
    },
  };
  return { links, mappings, calls, logs, connection, get released() { return released; }, fail: (error: Error) => { failure = error; }, deps: { getConnection: async () => connection, nowSec: () => fixtureNow, logError: (error: unknown) => { logs.push(error); } } };
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
