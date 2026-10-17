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
      if (sql.includes("FROM task_sessions")) {
        assert.equal(params[0], owner);
        return [{ theme_name: "Алгебра", tasks_number: 10, right_number: 8 }, { theme_name: "Алгебра", tasks_number: 10, right_number: 4 }] as T[];
      }
      if (sql.includes("marathon_participants")) {
        assert.equal(params[0], owner);
        return [{ title: "Весна" }] as T[];
      }
      assert.fail(sql);
    },
  };
  return { calls, get acquired() { return acquired; }, get released() { return released; }, getConnection: async () => { acquired++; return connection; } };
}

test("student statistics list this week's topic tests and finished marathons", async () => {
  const db = statsConnection(7);
  const stats = await getTelegramStudentStats(7, { ...db, nowSec: () => 1_700_000_000 });
  assert.equal(db.acquired, 1);
  assert.equal(db.released, 1);
  assert.equal(db.calls.length, 2);
  assert.equal(db.calls[0]!.params[0], 7);
  assert.match(db.calls[0]!.sql, /session_type/);
  assert.match(db.calls[1]!.sql, /marathon_participants/);
  assert.deepEqual(stats, {
    weekTopics: [{ name: "Алгебра", percent: 80 }],
    weekMarathons: [{ title: "Весна" }],
  });
  const text = formatTelegramStudentStats(stats);
  assert.match(text, /Алгебра — 80%/);
  assert.match(text, /Весна/);
  assert.doesNotMatch(text, /Функції/);
  await assert.rejects(getTelegramStudentStats(0, db), /Invalid stats owner/);
  await assert.rejects(getTelegramStudentStats(Number.NaN, db));
});

test("missing statistics produce a friendly empty state", () => {
  const text = formatTelegramStudentStats({ weekTopics: [], weekMarathons: [] });
  assert.match(text, /немає пройдених тем і завершених марафонів/);
  const partial = formatTelegramStudentStats({ weekTopics: [{ name: "Алгебра", percent: 80 }], weekMarathons: [] });
  assert.match(partial, /Алгебра — 80%/);
  assert.match(partial, /Завершені марафони[\s\S]*Ще немає/);
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
