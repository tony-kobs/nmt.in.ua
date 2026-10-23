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

test("a reply to the bot answer and the reply button stay on the same ticket", async () => {
  let followed: number | null | undefined;
  let opened: number | null = null;
  const acknowledged: string[] = [];
  const reply = await handleTelegramUpdate({
    message: {
      chat: { id: 7, type: "private" },
      from: { id: 7 },
      text: "уточнюю",
      reply_to_message: { message_id: 55 },
    },
  }, {
    consume: async () => false,
    support: {
      peek: async () => false,
      peekFollow: async () => false,
      cancel: async () => {},
      accept: async () => {
        throw new Error("a reply to the answer is not a new ticket");
      },
      acceptFollowup: async (input) => {
        followed = input.replyToMessageId;
        assert.equal(input.body, "уточнюю");
        assert.equal(input.kind, "text");
        return { text: "Продовження додано до звернення #4." };
      },
    },
  });
  assert.equal(followed, 55);
  assert.match(reply?.text ?? "", /Продовження/);

  const armed = await handleTelegramUpdate({
    callback_query: {
      id: "q9",
      data: "sp:r:4",
      from: { id: 7 },
      message: { message_id: 8, chat: { id: 7, type: "private" } },
    },
  }, {
    consume: async () => false,
    acknowledgeCallback: async (id) => { acknowledged.push(id); },
    support: {
      peek: async () => false,
      cancel: async () => {},
      accept: async () => null,
      armFollowup: async (chatId, ticketId) => {
        assert.equal(chatId, "7");
        opened = ticketId;
        return { text: "Напишіть продовження звернення #4." };
      },
    },
  });
  assert.equal(opened, 4);
  assert.deepEqual(acknowledged, ["q9"]);
  assert.match(armed?.text ?? "", /продовження/i);

  let followBody = "";
  const next = await handleTelegramUpdate({
    message: {
      chat: { id: 7, type: "private" },
      from: { id: 7 },
      photo: [{ file_id: "pic" }],
      caption: "ось скрін",
    },
  }, {
    consume: async () => false,
    support: {
      peek: async () => false,
      peekFollow: async () => true,
      cancel: async () => {},
      accept: async () => {
        throw new Error("an open follow-up is not a new ticket");
      },
      acceptFollowup: async (input) => {
        followBody = input.body;
        assert.equal(input.kind, "photo");
        assert.equal(input.replyToMessageId, null);
        return { text: "Продовження додано до звернення #4." };
      },
    },
  });
  assert.equal(followBody, "ось скрін");
  assert.match(next?.text ?? "", /Продовження/);
});
