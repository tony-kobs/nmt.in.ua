import assert from "node:assert/strict";
import { test } from "node:test";
import type { SqlConnection } from "@/lib/db/mysql";
import { completeTelegramTask } from "./completeTask";
import { createTaskReference, resolveTaskReference } from "./taskReference";
import { handleTelegramUpdate } from "./webhook";

const secret = "test-reference-secret";
const reference = createTaskReference(42, "123", secret);
const now = 1_800_000_000;

function database(options: { linked?: boolean; banned?: boolean; owned?: boolean; status?: number; expiry?: number; assignment?: { status: string; available_at: number | null; due_at: number | null }; unanswered?: boolean; fail?: boolean; type?: number } = {}) {
  let status = options.status ?? 2;
  let writes = 0;
  let commits = 0;
  let rollbacks = 0;
  let releases = 0;
  let queue = Promise.resolve();
  let unlock = () => {};
  const connection: SqlConnection = {
    beginTransaction: async () => {
      const previous = queue;
      let nextUnlock = () => {};
      queue = new Promise<void>((resolve) => { nextUnlock = resolve; });
      await previous;
      unlock = nextUnlock;
    },
    commit: async () => { commits++; },
    rollback: async () => { rollbacks++; },
    release: () => { releases++; unlock(); },
    query: async <T>(sql: string, params: unknown[] = []) => {
      if (options.fail) throw new Error("secret SQL credentials");
      assert.match(sql, /FOR UPDATE/);
      if (sql.includes("user_telegram_accounts")) {
        assert.match(sql, /u.is_banned = 0/);
        return (options.linked === false || options.banned ? [] : [{ user_id: 7 }]) as T[];
      }
      if (sql.includes("mentor_assignment_members")) return (options.assignment ? [options.assignment] : []) as T[];
      if (sql.includes("SELECT ts.session_type")) {
        assert.deepEqual(params, [42, 7, now]);
        assert.match(sql, /ts.user_id = \?/);
        assert.match(sql, /ts.session_status IN \(2, 3\)/);
        assert.match(sql, /ts.expire_time > \?/);
        return (options.owned === false || ![2, 3].includes(status) || (options.expiry ?? now + 100) <= now ? [] : [{ session_type: options.type ?? 1 }]) as T[];
      }
      if (sql.includes("FROM task_sessions")) return [{ id: 42, user_id: 7, theme_id: 1, theme_code: "A", theme_name: "Алгебра", session_status: status, expire_time: now + 100, tasks_number: 2, right_number: 0, start_time: now - 20, time: 0 }] as T[];
      if (sql.includes("FROM tasks2session")) return [{ status: 1 }, { status: options.unanswered ? 0 : -1 }] as T[];
      assert.fail(sql);
    },
    execute: async (_sql, params = []) => { writes++; status = Number(params[2]); return { affectedRows: 1, insertId: 0 }; },
  };
  return { deps: { getConnection: async () => connection, nowSec: () => now, secret, logError: () => {}, followUp: async () => ({ recommendations: [], insight: { } as never }) }, state: () => ({ writes, commits, rollbacks, releases, status }) };
}

test("references are opaque, authenticated, identity-bound and reject raw ids", () => {
  assert.equal(resolveTaskReference(reference, "123", secret), 42);
  for (const [value, identity, key] of [["42", "123", secret], [reference, "456", secret], [reference, "123", "wrong"], [reference.slice(0, -1) + "!", "123", secret]]) {
    assert.equal(resolveTaskReference(value, identity, key), null);
  }
});

test("owner completes through the real finish service; repeated completion is rejected", async () => {
  for (const type of [1, 5]) {
    const db = database({ type });
    assert.deepEqual(await completeTelegramTask("123", reference, db.deps), { status: "success" });
    assert.deepEqual(db.state(), { writes: 1, commits: 1, rollbacks: 0, releases: 1, status: 1 });
    assert.deepEqual(await completeTelegramTask("123", reference, db.deps), { status: "error", code: "cannotComplete" });
    assert.equal(db.state().writes, 1);
  }
});

test("unlinked/blocked account, foreign, completed, expired, cancelled and unavailable tasks never mutate", async () => {
  for (const options of [
    { linked: false }, { banned: true }, { owned: false }, { status: 1 }, { status: 99 }, { expiry: now },
    { assignment: { status: "cancelled", available_at: null, due_at: null } },
    { assignment: { status: "active", available_at: now + 1, due_at: null } },
    { assignment: { status: "active", available_at: null, due_at: now } }, { unanswered: true },
  ]) {
    const db = database(options);
    assert.deepEqual(await completeTelegramTask("123", reference, db.deps), { status: "error", code: options.linked === false || options.banned ? "notLinked" : "cannotComplete" });
    assert.equal(db.state().writes, 0);
    assert.equal(db.state().commits, 0);
    assert.equal(db.state().releases, 1);
    assert.equal(db.state().rollbacks, 1);
  }
});

test("concurrent done calls serialize and complete only once", async () => {
  const db = database();
  const results = await Promise.all([completeTelegramTask("123", reference, db.deps), completeTelegramTask("123", reference, db.deps)]);
  assert.deepEqual(results, [{ status: "success" }, { status: "error", code: "cannotComplete" }]);
  assert.equal(db.state().writes, 1);
});

test("recommendation follow-up runs once after commit and release; its failure cannot undo completion", async () => {
  const db = database();
  let calls = 0;
  const deps = { ...db.deps, followUp: async () => {
    calls++;
    assert.equal(db.state().commits, 1);
    assert.equal(db.state().releases, 1);
    throw new Error("private recommendation failure");
  } };
  assert.deepEqual(await completeTelegramTask("123", reference, deps), { status: "success" });
  assert.deepEqual(await completeTelegramTask("123", reference, deps), { status: "error", code: "cannotComplete" });
  assert.equal(calls, 1);
  assert.equal(db.state().writes, 1);
});

test("list replies supply an opaque completion reference without raw ids", async () => {
  const reply = await handleTelegramUpdate(update("/tasks"), {
    consume: async () => false, referenceSecret: secret,
    getTasks: async () => ({ status: "success", sessions: [{ sessionId: 42, sessionType: 3, themeId: 1, themeName: "Алгебра", status: 2, taskCount: 2, completedTaskCount: 2, expiresAt: now + 100 }] }),
  });
  const ref = /\/done ([A-Za-z0-9_-]+)/.exec(reply!.text)![1];
  assert.equal(resolveTaskReference(ref, "123", secret), 42);
  assert.doesNotMatch(reply!.text, /sessionId|themeId|\/done 42/);
});

test("database errors are safe and transactions roll back", async () => {
  const db = database({ fail: true });
  assert.deepEqual(await completeTelegramTask("123", reference, db.deps), { status: "error", code: "databaseFailure" });
  assert.equal(db.state().rollbacks, 1);
  assert.equal(db.state().releases, 1);
});

function update(text: string, type = "private") {
  return { message: { chat: { id: 123, type }, from: { id: 123 }, text } };
}

test("private done routing, malformed usage and safe unexpected failures", async () => {
  let calls = 0;
  const deps = { consume: async () => false, completeTask: async (identity: unknown, ref: unknown) => { calls++; assert.equal(identity, "123"); assert.equal(ref, reference); return { status: "success" as const }; } };
  assert.match((await handleTelegramUpdate(update(`/done ${reference}`), deps))!.text, /Завдання завершено/);
  assert.equal(await handleTelegramUpdate(update(`/done ${reference}`, "group"), deps), null);
  for (const text of ["/done", "/done 42", "/done bad extra", "/done@bot"]) {
    assert.match((await handleTelegramUpdate(update(text), deps))!.text, /Використайте/);
  }
  assert.equal(calls, 1);
  const reply = await handleTelegramUpdate(update(`/done ${reference}`), { ...deps, completeTask: async () => { throw new Error("secret SQL password"); }, logError: () => {} });
  assert.equal(reply!.text, "Не вдалося завершити завдання. Спробуйте пізніше.");
});
