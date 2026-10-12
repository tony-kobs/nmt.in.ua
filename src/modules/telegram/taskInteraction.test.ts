import assert from "node:assert/strict";
import { test } from "node:test";
import type { SqlConnection } from "@/lib/db/mysql";
import { getTelegramTaskDetails, type TaskDetailState } from "./taskDetails";
import { createTaskReference, resolveTaskReference } from "./taskReference";
import { handleTelegramUpdate } from "./webhook";
import { parseTaskCallback } from "./taskInteraction";

const secret = "test-reference-secret";
const reference = createTaskReference(42, "123", secret);
function callback(data: unknown) {
  return { callback_query: { id: "query123", from: { id: 123 }, message: { chat: { id: 123, type: "private" } }, data } };
}

test("malformed callback envelopes are ignored without acknowledgement or service calls", async () => {
  for (const update of [null, [], "bad", { callback_query: null },
    { callback_query: { ...callback("bad").callback_query, id: "" } },
    { callback_query: { ...callback("bad").callback_query, from: { id: 0 } } },
    { callback_query: { ...callback("bad").callback_query, message: null } },
  ]) {
    assert.equal(await handleTelegramUpdate(update, {
      consume: async () => { assert.fail("must not link"); },
      acknowledgeCallback: async () => { assert.fail("must not acknowledge"); },
      getDetails: async () => { assert.fail("must not read"); },
      completeTask: async () => { assert.fail("must not complete"); },
    }), null);
  }
});

test("acknowledgement failure stops callback processing", async () => {
  await assert.rejects(handleTelegramUpdate(callback(`a:${reference}`), {
    consume: async () => false, referenceSecret: secret,
    acknowledgeCallback: async () => { throw new Error("ack failed"); },
    getDetails: async () => { assert.fail("must not read"); },
    completeTask: async () => { assert.fail("must not complete"); },
  }), /ack failed/);
});

test("unexpected callback service failure returns a safe reply after acknowledgement", async () => {
  const calls: string[] = [];
  const reply = await handleTelegramUpdate(callback(`d:${reference}`), {
    consume: async () => false, referenceSecret: secret,
    acknowledgeCallback: async () => { calls.push("ack"); },
    getDetails: async () => { calls.push("details"); throw new Error("private SQL password"); },
    logError: () => { calls.push("log"); },
  });
  assert.deepEqual(calls, ["ack", "details", "log"]);
  assert.equal(reply!.text, "Не вдалося обробити дію. Спробуйте пізніше.");
  assert.equal(reply!.replyMarkup, undefined);
});

test("inline confirmation acknowledges first and delegates only explicit approval to TG-005", async () => {
  const calls: string[] = [];
  const deps = {
    consume: async () => false, referenceSecret: secret,
    acknowledgeCallback: async (id: string) => { assert.equal(id, "query123"); calls.push("ack"); },
    getDetails: async () => { calls.push("details"); return { status: "success" as const, task: { title: "Алгебра", state: "available" as const, expiresAt: null } }; },
    completeTask: async (identity: unknown, ref: unknown) => {
      assert.equal(identity, "123"); assert.equal(resolveTaskReference(ref, "123", secret), 42);
      calls.push("complete"); return { status: "success" as const };
    },
  };
  const reply = await handleTelegramUpdate(callback(`a:${reference}`), deps);
  assert.deepEqual(calls, ["ack", "details"]);
  const approval = reply!.replyMarkup!.inline_keyboard[0][0].callback_data!;
  assert.ok(Buffer.byteLength(approval) <= 64);
  assert.equal(resolveTaskReference(approval.slice(2), "123", secret), null);
  await handleTelegramUpdate(callback(`y:${reference}`), deps);
  assert.equal(calls.includes("complete"), false);
  assert.match((await handleTelegramUpdate(callback(approval), deps))!.text, /Завдання завершено/);
  assert.deepEqual(calls.slice(-3), ["ack", "details", "complete"]);
  await handleTelegramUpdate(callback(`n:${reference}`), deps);
  assert.equal(calls.filter((call) => call === "complete").length, 1);
});

test("unavailable states and invalid references never complete or expose internals", async () => {
  for (const state of ["completed", "expired", "cancelled", "waiting", "unavailable"] as TaskDetailState[]) {
    const reply = await handleTelegramUpdate(callback(`a:${reference}`), {
      consume: async () => false, referenceSecret: secret,
      getDetails: async () => ({ status: "success", task: { title: "Алгебра", state, expiresAt: null } }),
      completeTask: async () => { assert.fail("must not complete"); },
    });
    // Only navigation remains: no completion or approval button for an unavailable task.
    const actions = (reply!.replyMarkup?.inline_keyboard.flat() ?? []).map((button) => button.callback_data ?? "");
    assert.ok(actions.every((data) => /^m:/.test(data)), actions.join(","));
    assert.doesNotMatch(reply!.text, /42|sessionId|SQL|password/);
  }
  for (const code of ["notLinked", "invalidReference", "databaseFailure"] as const) {
    const reply = await handleTelegramUpdate(callback(`d:${reference}`), {
      consume: async () => false, referenceSecret: secret, getDetails: async () => ({ status: "error", code }),
    });
    assert.doesNotMatch(reply!.text, /42|SQL|databaseFailure|invalidReference/);
  }
  let acknowledgements = 0;
  for (const data of ["d:42", "x:" + reference, "d:" + "a".repeat(65), `d:${createTaskReference(42, "123", "old-secret")}`]) {
    const reply = await handleTelegramUpdate(callback(data), {
      consume: async () => false, referenceSecret: secret,
      acknowledgeCallback: async () => { acknowledgements++; },
      getDetails: async () => { assert.fail("invalid reference must not read"); },
    });
    assert.match(reply!.text, /недійсне/);
  }
  assert.equal(acknowledgements, 4);
  assert.equal(parseTaskCallback({ callback_query: { ...callback("bad").callback_query, from: { id: 456 } } }), null);
  assert.equal(parseTaskCallback({ callback_query: { ...callback("bad").callback_query, message: { chat: { id: 123, type: "group" } } } }), null);
});

test("details read scopes ownership and bans in SQL and returns only safe fields", async () => {
  const base = { id: 42, title: "Алгебра", session_status: 2, expire_time: 200, tasks_number: 2, right_number: 0, time: 0, cancelled: 0, waiting: 0, overdue: 0 };
  for (const [patch, expected] of [
    [{}, "available"], [{ session_status: 1 }, "completed"], [{ expire_time: 100 }, "expired"],
    [{ cancelled: 1 }, "cancelled"], [{ waiting: 1 }, "waiting"], [{ overdue: 1 }, "expired"],
    [{ session_status: 8 }, "unavailable"],
  ] as const) {
    let released = false;
    const connection = {
      query: async (sql: string, params: unknown[]) => {
        assert.match(sql, /ts\.user_id = uta\.user_id/); assert.match(sql, /u\.is_banned = 0/);
        assert.deepEqual(params, [100, 100, 42, "123"]);
        return [{ ...base, ...patch }];
      }, release: () => { released = true; },
    } as unknown as SqlConnection;
    const result = await getTelegramTaskDetails("123", reference, { secret, nowSec: () => 100, getConnection: async () => connection });
    assert.deepEqual(result, { status: "success", task: { title: "Алгебра", state: expected, expiresAt: { ...base, ...patch }.expire_time } });
    assert.equal(released, true);
  }
  for (const [rows, code] of [[[], "notLinked"], [[{ ...base, id: null }], "invalidReference"]] as const) {
    const connection = { query: async () => rows, release: () => {} } as unknown as SqlConnection;
    assert.deepEqual(await getTelegramTaskDetails("123", reference, { secret, getConnection: async () => connection }), { status: "error", code });
  }
  assert.deepEqual(await getTelegramTaskDetails("456", reference, { secret, getConnection: async () => { assert.fail("foreign identity"); } }), { status: "error", code: "invalidReference" });
  assert.deepEqual(await getTelegramTaskDetails("123", reference, { secret, getConnection: async () => { throw new Error("SQL secret"); }, logError: () => {} }), { status: "error", code: "databaseFailure" });
});

test("tasks and today keyboards use opaque identity-bound references", async () => {
  for (const command of ["tasks", "today"]) {
    const getTasks = async () => ({ status: "success" as const, sessions: [{ sessionId: 42, sessionType: 1, themeId: 9, themeName: "Алгебра", status: 2, taskCount: 2, completedTaskCount: 1, expiresAt: 200 }] });
    const reply = await handleTelegramUpdate({ message: { chat: { id: 123, type: "private" }, from: { id: 123 }, text: `/${command}` } }, {
      consume: async () => false, referenceSecret: secret, getTasks, getTodayTasks: getTasks,
    });
    const buttons = reply!.replyMarkup!.inline_keyboard.flat();
    assert.ok(buttons.some((button) => button.callback_data?.startsWith("m:")), "list keeps menu navigation");
    for (const button of buttons.filter((item) => !item.callback_data?.startsWith("m:"))) {
      assert.ok(Buffer.byteLength(button.callback_data!) <= 64);
      assert.equal(resolveTaskReference(button.callback_data!.slice(2), "123", secret), 42);
      assert.doesNotMatch(button.callback_data!, /^[da]:42$/);
    }
  }
});
