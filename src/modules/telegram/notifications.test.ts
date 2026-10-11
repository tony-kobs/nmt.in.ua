import assert from "node:assert/strict";
import { test } from "node:test";
import type { SqlConnection } from "@/lib/db/mysql";
import { processTelegramTaskNotifications } from "./notifications";
import { isNotificationClaimable } from "./notificationDelivery";
import { sendTelegramMessage, type TelegramSendResult } from "./transport";
import { resolveTaskReference } from "./taskReference";
import { handleTelegramUpdate } from "./webhook";
import type { TelegramReply } from "./taskInteraction";

const now = 1_800_000_000;
const config = { botToken: "private-bot-token", webhookSecret: "reference-secret", botUsername: "test_bot" };
type Session = { id: number; user_id: number; session_status: number; expire_time: number | null; tasks_number: number; right_number: number; time: number; available_at: number; due_at: number; cancelled: boolean };
const session = (id = 42, patch: Partial<Session> = {}): Session => ({ id, user_id: 7, session_status: 2, expire_time: now + 100, tasks_number: 2, right_number: 0, time: 0, available_at: now, due_at: now + 100, cancelled: false, ...patch });

function database(sessions = [session()]) {
  const accounts = [{ id: 1, user_id: 7, telegram_user_id: "123", telegram_chat_id: "123", banned: false }];
  const deliveries = new Map<string, { delivery_state: string; messageId: number | null }>();
  const replies: TelegramReply[] = [];
  const logs: unknown[] = [];
  const sqlCalls: string[] = [];
  let result: TelegramSendResult = { status: "sent", messageId: 100 };
  let queue = Promise.resolve();
  let failDeliverySave = false;
  let changeBeforeLock: (() => void) | undefined;
  const getConnection = async (): Promise<SqlConnection> => {
    let unlock: (() => void) | undefined;
    let snapshot: typeof deliveries | undefined;
    const finish = () => { snapshot = undefined; unlock?.(); unlock = undefined; };
    return {
      beginTransaction: async () => {
        assert.equal(unlock, undefined);
        const previous = queue;
        queue = new Promise<void>((resolve) => { unlock = resolve; });
        await previous;
        snapshot = structuredClone(deliveries);
      },
      commit: async () => { finish(); },
      rollback: async () => {
        if (snapshot) { deliveries.clear(); for (const [key, value] of snapshot) deliveries.set(key, value); }
        finish();
      },
      release: () => { assert.equal(unlock, undefined); },
      query: async <T>(sql: string, params: unknown[] = []) => {
        sqlCalls.push(sql);
        if (sql.includes("telegram_notification_preferences")) return [] as T[];
        if (sql.includes("SELECT delivery_state")) return [deliveries.get(params.join(":"))] as T[];
        if (sql.includes("FOR UPDATE") && sql.includes("user_telegram_accounts")) { changeBeforeLock?.(); changeBeforeLock = undefined; }
        if (sql.includes("LEFT JOIN task_sessions")) {
          assert.match(sql, /ts.user_id = uta.user_id/);
          assert.match(sql, /u.is_banned = 0/);
          assert.match(sql, /ts.session_status IN \(\?, \?\)/);
          assert.match(sql, /ts.expire_time > \?/);
          assert.match(sql, /ma.status = 'cancelled' OR ma.available_at > \? OR ma.due_at <= \?/);
          assert.doesNotMatch(sql, /LIMIT|right_answer|quiz_tasks/);
          const link = accounts.find((a) => a.telegram_user_id === params.at(-1) && !a.banned);
          if (!link) return [];
          const target = sql.includes("ts.id = ?") ? Number(params[5]) : undefined;
          const current = sessions.filter((s) => s.user_id === link.user_id && (target === undefined || s.id === target)
            && [2, 3].includes(s.session_status) && s.expire_time !== null && s.expire_time > Number(params[4])
            && !(s.tasks_number > 0 && s.right_number >= s.tasks_number && s.time > 0)
            && !s.cancelled && s.available_at <= Number(params[4]) && s.due_at > Number(params[4]));
          return (current.length ? current.map((s) => ({ ...s, session_type: 1, theme_id: null, theme_name: "Алгебра", mapping_count: 0, answered_count: 0 })) : [{ id: null }]) as T[];
        }
        if (sql.includes("user_telegram_accounts")) return accounts.filter((a) => !a.banned && a.telegram_chat_id === a.telegram_user_id && (!params.length || (a.id === params[0] && a.telegram_user_id === params[1]))) as T[];
        if (sql.includes("FOR UPDATE") && (sql.includes("task_sessions") || sql.includes("mentor_assignment_members"))) return [];
        assert.fail(sql);
      },
      execute: async (sql: string, params: unknown[] = []) => {
        sqlCalls.push(sql);
        assert.match(sql, /telegram_task_notifications/);
        if (sql.includes("INSERT INTO")) {
          const key = params.join(":");
          if (!deliveries.has(key)) deliveries.set(key, { delivery_state: "ready", messageId: null });
        } else if (sql.includes("attempted_at")) deliveries.get(params.join(":"))!.delivery_state = "sending";
        else {
          if (failDeliverySave) throw new Error("delivery persistence failed");
          const item = deliveries.get(params.slice(2).join(":"))!;
          assert.equal(item.delivery_state, "sending");
          item.delivery_state = String(params[0]); item.messageId = params[1] as number | null;
        }
        return { insertId: 0, affectedRows: 1 };
      },
    };
  };
  return {
    accounts, deliveries, replies, logs, sqlCalls,
    setResult: (value: TelegramSendResult) => { result = value; },
    beforeLock: (change: () => void) => { changeBeforeLock = change; },
    failSave: () => { failDeliverySave = true; },
    deps: { getConnection, readConfig: () => config, nowSec: () => now, logError: (value: unknown) => { logs.push(value); },
      send: async (reply: TelegramReply) => { replies.push(reply); return result; } },
  };
}

test("eligible owned notification is Ukrainian, persisted once and uses the TG-006 details callback", async () => {
  const db = database([session(), session(99, { user_id: 8 })]);
  assert.equal((await processTelegramTaskNotifications(db.deps)).sent, 1);
  assert.equal(db.replies.length, 1);
  assert.match(db.replies[0].text, /^📚 <b>Нове завдання<\/b>\n\nАлгебра\nЗавдань: 2\n⏰ Термін: /);
  assert.doesNotMatch(db.replies[0].text, /42|sessionId|user_id/);
  assert.equal(db.replies[0].parseMode, "HTML");
  assert.equal(db.replies[0].disablePreview, true);
  assert.equal(db.replies[0].chatId, "123");
  const data = db.replies[0].replyMarkup!.inline_keyboard[0][0].callback_data!;
  assert.ok(Buffer.byteLength(data) <= 64);
  assert.equal(resolveTaskReference(data.slice(2), "123", config.webhookSecret), 42);
  assert.equal(resolveTaskReference(data.slice(2), "456", config.webhookSecret), null);
  const detail = await handleTelegramUpdate({ callback_query: { id: "q1", from: { id: 123 }, message: { chat: { id: 123, type: "private" } }, data } }, {
    consume: async () => false, referenceSecret: config.webhookSecret,
    getDetails: async () => ({ status: "success", task: { title: "Алгебра", state: "available", expiresAt: now + 100 } }),
  });
  assert.match(detail!.text, /Алгебра/);
  assert.equal(db.deliveries.get("1:42:new_task")?.delivery_state, "delivered");
  assert.equal(db.deliveries.get("1:42:new_task")?.messageId, 100);
  assert.equal((await processTelegramTaskNotifications(db.deps)).sent, 0);
  assert.equal(db.replies.length, 1);
});

for (const [name, patch] of [
  ["foreign owner", { user_id: 8 }], ["completed", { session_status: 1 }], ["unsupported status", { session_status: 99 }],
  ["expired boundary", { expire_time: now }], ["missing expiry", { expire_time: null }], ["zero expiry", { expire_time: 0 }],
  ["completed display rule", { right_number: 2, time: 10 }], ["cancelled", { cancelled: true }],
  ["future availability", { available_at: now + 1 }], ["deadline boundary", { due_at: now }],
] as [string, Partial<Session>][]) {
  test(`notifications skip ${name}`, async () => {
    const db = database([session(42, patch)]);
    assert.equal((await processTelegramTaskNotifications(db.deps)).sent, 0);
    assert.equal(db.replies.length, 0);
    assert.equal(db.deliveries.size, 0);
  });
}

test("unlinked, blocked and non-private account destinations never receive notifications", async () => {
  for (const kind of ["unlinked", "blocked", "group"]) {
    const db = database();
    if (kind === "unlinked") db.accounts.splice(0);
    if (kind === "blocked") db.accounts[0].banned = true;
    if (kind === "group") db.accounts[0].telegram_chat_id = "-123";
    await processTelegramTaskNotifications(db.deps);
    assert.equal(db.replies.length, 0);
  }
});

test("availability and ownership are rechecked under locks after selection", async () => {
  for (const kind of ["cancelled", "completed", "foreign", "blocked", "unlinked", "expired"]) {
    const tasks = [session()];
    const db = database(tasks);
    db.beforeLock(() => {
      if (kind === "cancelled") tasks[0].cancelled = true;
      if (kind === "completed") tasks[0].session_status = 1;
      if (kind === "foreign") tasks[0].user_id = 8;
      if (kind === "blocked") db.accounts[0].banned = true;
      if (kind === "unlinked") db.accounts.splice(0);
      if (kind === "expired") tasks[0].expire_time = now;
    });
    assert.equal((await processTelegramTaskNotifications(db.deps)).sent, 0);
    assert.equal(db.replies.length, 0);
  }
});

test("confirmed API rejection is logged, leaves task unchanged and retries on the next run", async () => {
  const tasks = [session()]; const before = structuredClone(tasks);
  const db = database(tasks);
  db.setResult({ status: "rejected", context: { httpStatus: 429, errorCode: 429 } });
  assert.equal((await processTelegramTaskNotifications(db.deps)).rejected, 1);
  assert.equal(db.deliveries.get("1:42:new_task")?.delivery_state, "ready");
  assert.deepEqual(tasks, before);
  assert.equal(db.logs.length, 1);
  db.setResult({ status: "sent", messageId: 101 });
  assert.equal((await processTelegramTaskNotifications(db.deps)).sent, 1);
  assert.equal(db.replies.length, 2);
});

test("concurrent processors claim the same notification only once", async () => {
  const db = database();
  const results = await Promise.all([processTelegramTaskNotifications(db.deps), processTelegramTaskNotifications(db.deps)]);
  assert.equal(results.reduce((sum, result) => sum + result.sent, 0), 1);
  assert.equal(db.replies.length, 1);
  assert.equal(db.deliveries.size, 1);
});

test("persisted sending and delivered claims survive processor invocations without task writes", async () => {
  for (const state of ["sending", "delivered"]) {
    const tasks = [session()];
    const before = structuredClone(tasks);
    const db = database(tasks);
    const delivery = { delivery_state: state, messageId: state === "delivered" ? 100 : null };
    db.deliveries.set("1:42:new_task", { ...delivery });
    assert.deepEqual(await processTelegramTaskNotifications(db.deps), { sent: 0, rejected: 0, uncertain: 0, skipped: 1, failed: 0 });
    assert.deepEqual(db.deliveries.get("1:42:new_task"), delivery);
    assert.equal(db.replies.length, 0);
    assert.deepEqual(tasks, before);
    assert.ok(db.sqlCalls.filter((sql) => /^\s*(INSERT|UPDATE)\b/.test(sql)).every((sql) => sql.includes("telegram_task_notifications")));
  }
});

test("successful notification delivery leaves task and session state unchanged", async () => {
  const tasks = [session()];
  const before = structuredClone(tasks);
  const db = database(tasks);
  assert.equal((await processTelegramTaskNotifications(db.deps)).sent, 1);
  assert.deepEqual(tasks, before);
  assert.ok(db.sqlCalls.filter((sql) => /^\s*(INSERT|UPDATE)\b/.test(sql)).every((sql) => sql.includes("telegram_task_notifications")));
});

test("notifications do not inherit the 50-task display limit", async () => {
  const db = database(Array.from({ length: 60 }, (_, i) => session(i + 1)));
  assert.equal((await processTelegramTaskNotifications(db.deps)).sent, 60);
  assert.equal(db.replies.length, 60);
});

test("only ready claims are claimable; uncertain sending claims are never retried automatically", () => {
  assert.equal(isNotificationClaimable("ready"), true);
  assert.equal(isNotificationClaimable("sending"), false);
  assert.equal(isNotificationClaimable("delivered"), false);
  assert.equal(isNotificationClaimable(undefined), false);
});

test("unknown transport outcome and post-send database failure retain the claim to prevent duplicates", async () => {
  for (const kind of ["unknown", "database", "throw"]) {
    const db = database();
    if (kind === "unknown") db.setResult({ status: "unknown", context: { errorName: "TimeoutError" } });
    if (kind === "database") db.failSave();
    if (kind === "throw") db.deps.send = async (reply) => { db.replies.push(reply); throw new Error("transport failed"); };
    const result = await processTelegramTaskNotifications(db.deps);
    assert.equal(result.uncertain + result.failed, 1);
    assert.equal(db.deliveries.get("1:42:new_task")?.delivery_state, "sending");
    await processTelegramTaskNotifications(db.deps);
    assert.equal(db.replies.length, 1);
    assert.equal(db.logs.length, 1);
  }
});

test("missing configuration fails before opening a database connection", async () => {
  await assert.rejects(processTelegramTaskNotifications({ getConnection: async () => { assert.fail(); }, readConfig: () => { throw new Error("not configured"); } }), /not configured/);
});

test("Telegram transport validates API success and rejection without leaking tokens or API descriptions", async () => {
  const reply = { chatId: "123", text: "У вас доступне нове завдання." };
  const sent = await sendTelegramMessage(reply, config.botToken, async (url, init) => {
    assert.match(String(url), /\/sendMessage$/);
    assert.equal(init?.cache, "no-store");
    assert.deepEqual(JSON.parse(String(init?.body)), { chat_id: "123", text: reply.text });
    return new Response('{"ok":true,"result":{"message_id":10}}');
  });
  assert.deepEqual(sent, { status: "sent", messageId: 10 });
  const rejected = await sendTelegramMessage(reply, config.botToken, async () => new Response('{"ok":false,"error_code":403,"description":"private token"}', { status: 403 }));
  assert.deepEqual(rejected, { status: "rejected", context: { httpStatus: 403, errorCode: 403 } });
  for (const request of [
    async () => new Response("not json", { status: 502 }), async () => new Response('{"ok":true}'),
    async () => { throw new TypeError(`https://api.telegram.org/bot${config.botToken}`); },
  ]) {
    const result = await sendTelegramMessage(reply, config.botToken, request);
    assert.equal(result.status, "unknown");
    assert.doesNotMatch(JSON.stringify(result), /private-bot-token|private token/);
  }
});
