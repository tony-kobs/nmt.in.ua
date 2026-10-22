import assert from "node:assert/strict";
import test from "node:test";

import type { TelegramAccountResult } from "./account";
import { handleMenuRequest } from "./menu";
import { handleTelegramUpdate } from "./webhook";

const student: TelegramAccountResult = {
  status: "success",
  profile: { accountId: 1, userId: 7, role: "student", displayName: "Іра", linkedAt: 1 },
};

test("help offers a message to the team and the public chat when it is set", async () => {
  const reply = await handleMenuRequest({
    chatId: "7",
    userId: "7",
    action: { kind: "screen", screen: "help" },
  }, {
    getProfile: async () => student,
    loadSupportHelp: async () => ({ button: "Написати команді", chatLine: "Чат учасників: https://t.me/nmt" }),
  });
  assert.match(reply.text, /Чат учасників: https:\/\/t\.me\/nmt/);
  assert.equal(reply.replyMarkup?.inline_keyboard[0]?.[0]?.callback_data, "m:support");
  const armed = await handleMenuRequest({
    chatId: "7",
    userId: "7",
    action: { kind: "support" },
  }, {
    getProfile: async () => student,
    armSupport: async (chatId, userId) => {
      assert.equal(chatId, "7");
      assert.equal(userId, 7);
      return { ok: true, ask: "Напишіть команді" };
    },
  });
  assert.match(armed.text, /Напишіть команді/);
});

test("the next message becomes a ticket and a menu label cancels the wait", async () => {
  const accepted: string[] = [];
  let waiting = true;
  const ticket = await handleTelegramUpdate({
    message: { chat: { id: 7, type: "private" }, from: { id: 7 }, text: "не відкривається день" },
  }, {
    consume: async () => false,
    support: {
      peek: async () => waiting,
      cancel: async () => { waiting = false; },
      accept: async ({ body }) => {
        accepted.push(body);
        waiting = false;
        return { text: "Дякуємо" };
      },
    },
  });
  assert.equal(ticket?.text, "Дякуємо");
  assert.deepEqual(accepted, ["не відкривається день"]);

  waiting = true;
  const cancelled = await handleTelegramUpdate({
    message: { chat: { id: 7, type: "private" }, from: { id: 7 }, text: "❓ Допомога" },
  }, {
    consume: async () => false,
    getProfile: async () => student,
    support: {
      peek: async () => waiting,
      cancel: async () => { waiting = false; },
      accept: async () => { throw new Error("menu label is not a ticket"); },
    },
    menu: { loadSupportHelp: async () => ({ button: "Написати команді", chatLine: null }) },
  });
  assert.equal(waiting, false);
  assert.match(cancelled?.text ?? "", /Допомога/);
  assert.equal(cancelled?.replyMarkup?.inline_keyboard[0]?.[0]?.callback_data, "m:support");
});
