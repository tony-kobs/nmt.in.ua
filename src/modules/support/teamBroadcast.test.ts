import assert from "node:assert/strict";
import test from "node:test";

import {
  broadcastRecipientChats,
  isGroupAdminStatus,
  isSiteAdmin,
  telegramGroupAdmin,
} from "./teamBroadcast";

test("recipients are linked chats that are not paused or stopped", async () => {
  const queries: string[] = [];
  const chats = await broadcastRecipientChats({
    query: async <T>(sql: string) => {
      queries.push(sql);
      return [
        { telegram_chat_id: "100" },
        { telegram_chat_id: "100" },
        { telegram_chat_id: null },
        { telegram_chat_id: "-100" },
      ] as T[];
    },
  }, 3);
  assert.deepEqual(chats, ["100"]);
  const sql = queries[0] ?? "";
  assert.match(sql, /notify_paused = 0/);
  assert.match(sql, /user_telegram_accounts/);
  assert.match(sql, /marathon_declines/);
  assert.match(sql, /deletion_due_at IS NULL/);
});

test("a site admin or a group creator may send, and the token stays out of the log", async () => {
  assert.equal(isGroupAdminStatus("creator"), true);
  assert.equal(isGroupAdminStatus("administrator"), true);
  assert.equal(isGroupAdminStatus("member"), false);
  const admin = await isSiteAdmin({
    query: async <T>() => [{ role: "admin" }] as T[],
  }, "42");
  const teacher = await isSiteAdmin({
    query: async <T>() => [{ role: "teacher" }] as T[],
  }, "42");
  assert.equal(admin, true);
  assert.equal(teacher, false);
  const logs: unknown[] = [];
  const saved = console.error;
  console.error = (...args: unknown[]) => {
    logs.push(args);
  };
  try {
    const allowed = await telegramGroupAdmin({
      token: "secret-bot-token",
      chatId: "-100555",
      userId: "42",
      request: async () => new Response(JSON.stringify({ ok: true, result: { status: "creator" } })),
    });
    assert.equal(allowed, true);
    const denied = await telegramGroupAdmin({
      token: "secret-bot-token",
      chatId: "-100555",
      userId: "7",
      request: async () => {
        throw new Error("network");
      },
    });
    assert.equal(denied, false);
  } finally {
    console.error = saved;
  }
  assert.equal(JSON.stringify(logs).includes("secret-bot-token"), false);
});
