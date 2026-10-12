import assert from "node:assert/strict";
import { test } from "node:test";
import type { SqlConnection } from "@/lib/db/mysql";
import { deliverTelegramReplies } from "./deliver";
import { formatTelegramStudentStats, getTelegramStudentStats } from "./stats";
import { sendTelegramMessage } from "./transport";

function statsConnection(owner: number) {
  let acquired = 0;
  let released = 0;
  const calls: { sql: string; params: unknown[] }[] = [];
  const connection: SqlConnection = {
    beginTransaction: async () => { assert.fail("stats are read-only"); },
    commit: async () => { assert.fail("stats are read-only"); },
    rollback: async () => { assert.fail("stats are read-only"); },
    execute: async () => { assert.fail("stats are read-only"); },
    release: () => { released++; },
    query: async <T>(sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      assert.doesNotMatch(sql, /right_answer|quiz_tasks|password/i);
      if (sql.includes("COUNT(*) AS completed")) { assert.deepEqual(params, [owner, 1]); return [{ completed: 4 }] as T[]; }
      if (sql.includes("FROM themes")) return [{ id: 1, name: "Алгебра", ord: 1 }, { id: 2, name: "Геометрія", ord: 2 }, { id: 3, name: "Функції", ord: 3 }] as T[];
      if (sql.includes("ROW_NUMBER()")) {
        assert.equal(params[0], owner);
        return [
          { id: 9, theme_id: 2, tasks_number: 10, right_number: 3, time: 100 },
          { id: 8, theme_id: 1, tasks_number: 10, right_number: 9, time: 100 },
          { id: 7, theme_id: 1, tasks_number: 10, right_number: 7, time: 100 },
        ] as T[];
      }
      if (sql.includes("COALESCE(t.name")) {
        assert.equal(params[0], owner);
        return [{ id: 9, theme_name: "Геометрія", tasks_number: 10, right_number: 3 }, { id: 8, theme_name: "Алгебра", tasks_number: 10, right_number: 9 }] as T[];
      }
      assert.fail(sql);
    },
  };
  return { calls, get acquired() { return acquired; }, get released() { return released; }, getConnection: async () => { acquired++; return connection; } };
}

test("student statistics reuse results services, use one connection and stay owner-scoped", async () => {
  const db = statsConnection(7);
  const stats = await getTelegramStudentStats(7, db);
  assert.equal(db.acquired, 1);
  assert.equal(db.released, 1);
  assert.deepEqual(stats, {
    completedSessions: 4,
    averagePercent: (80 + 30) / 2,
    recent: [{ topic: "Геометрія", score: 30 }, { topic: "Алгебра", score: 90 }],
    topics: [{ name: "Алгебра", percent: 80, lastPercent: 90 }, { name: "Геометрія", percent: 30, lastPercent: 30 }],
    weakest: [{ name: "Геометрія", percent: 30 }],
  });
  const text = formatTelegramStudentStats(stats);
  assert.match(text, /🔴 Геометрія — 30%/);
  assert.doesNotMatch(text, /Функції/, "themes without attempts are not listed as progress");
  await assert.rejects(getTelegramStudentStats(0, db), /Invalid stats owner/);
  await assert.rejects(getTelegramStudentStats(Number.NaN, db));
});

test("missing statistics produce a friendly empty state", () => {
  const text = formatTelegramStudentStats({ completedSessions: 0, averagePercent: null, recent: [], topics: [], weakest: [] });
  assert.match(text, /Поки що немає завершених сесій/);
  const partial = formatTelegramStudentStats({ completedSessions: 2, averagePercent: null, recent: [], topics: [], weakest: [] });
  assert.match(partial, /Середній результат: <b>—<\/b>/);
});

test("menu edits use editMessageText and fall back to a new message when the original cannot be edited", async () => {
  const methods: string[] = [];
  const respond = (body: unknown) => new Response(JSON.stringify(body));
  const reply = { chatId: "123", text: "Меню", editMessageId: 77, disablePreview: true };
  let next: unknown = { ok: true, result: { message_id: 77 } };
  const request = (async (url: string | URL, init?: RequestInit) => {
    methods.push(String(url).split("/").at(-1)!);
    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body.link_preview_options, { is_disabled: true });
    if (String(url).endsWith("editMessageText")) assert.equal(body.message_id, 77);
    else assert.equal(body.message_id, undefined);
    const current = next;
    next = { ok: true, result: { message_id: 78 } };
    return respond(current);
  }) as typeof fetch;
  const options = { request, now: () => 0, sleep: async () => {} };
  assert.equal((await deliverTelegramReplies([reply], "token", options)).sent, 1);
  assert.deepEqual(methods, ["editMessageText"]);
  methods.length = 0;
  next = { ok: false, error_code: 400, description: "Bad Request: message is not modified" };
  assert.equal((await deliverTelegramReplies([reply], "token", options)).sent, 1);
  assert.deepEqual(methods, ["editMessageText"], "unchanged content is not re-sent");
  methods.length = 0;
  next = { ok: false, error_code: 400, description: "Bad Request: message to edit not found" };
  assert.equal((await deliverTelegramReplies([reply], "token", options)).sent, 1);
  assert.deepEqual(methods, ["editMessageText", "sendMessage"]);
  const rejected = await sendTelegramMessage({ chatId: "1", text: "x", editMessageId: 5 }, "token", async () =>
    respond({ ok: false, error_code: 400, description: "secret details" }));
  assert.doesNotMatch(JSON.stringify(rejected), /secret details/);
});

test("marathon and existing replies keep link previews unless a reply opts out", async () => {
  const bodies: Record<string, unknown>[] = [];
  const request = (async (_url: string | URL, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    return new Response('{"ok":true,"result":{"message_id":1}}');
  }) as typeof fetch;
  await sendTelegramMessage({ chatId: "1", text: "https://nmt.in.ua" }, "token", request);
  await sendTelegramMessage({ chatId: "1", text: "x", linkPreviewUrl: "https://youtu.be/x", disablePreview: true }, "token", request);
  assert.equal(bodies[0].link_preview_options, undefined);
  assert.equal((bodies[1].link_preview_options as { is_disabled: boolean }).is_disabled, false);
});
