import assert from "node:assert/strict";
import test from "node:test";
import { callbackFrom, callbackMessageId, handleMarathonGateway, marathonUpdateKind } from "./botGateway";

test("leaderboard commands share the existing daily marathon top callback", () => {
  for (const text of ["/top", "/top@nmt_bot", "/leaderboard", "/leaderboard@nmt_bot", "/leaderboard  "]) {
    assert.deepEqual(callbackFrom({ chatId: "123", text, data: null }), { kind: "top" });
  }
  assert.deepEqual(callbackFrom({ chatId: "123", text: null, data: "mh:top" }), { kind: "top" });
  for (const text of ["/leaderboard extra", "/leaderboard_suffix", "/top extra"]) {
    assert.equal(callbackFrom({ chatId: "123", text, data: null }), null);
  }
});

test("leaderboard aliases reject group messages and a different chat owner before loading data", async () => {
  for (const text of ["/top", "/leaderboard", "/leaderboard@nmt_bot"]) {
    for (const chat of [{ id: -100, type: "group" }, { id: 456, type: "private" }]) {
      assert.equal(await handleMarathonGateway({ message: { text, chat, from: { id: 123 } } }), null);
    }
  }
});

test("a reply-keyboard press is not edited onto the fake message", () => {
  const real = {
    callback_query: {
      id: "abc",
      data: "mh:today",
      from: { id: 123 },
      message: { message_id: 42, chat: { id: 123, type: "private" } },
    },
  };
  assert.equal(callbackMessageId(real), 42);
  assert.equal(callbackMessageId({
    callback_query: {
      id: "reply-keyboard",
      data: "mh:today",
      from: { id: 123 },
      message: { message_id: 1, chat: { id: 123, type: "private" } },
    },
  }), null);
  assert.equal(callbackMessageId({ message: { text: "Сьогодні", chat: { id: 123, type: "private" }, from: { id: 123 } } }), null);
});

test("daily marathon entry parsing preserves private chat ownership and deep links", () => {
  for (const text of ["/menu", "/start"]) {
    const message = { chat: { id: 123, type: "private" }, from: { id: 123 }, text };
    assert.equal(marathonUpdateKind({ message }), text === "/menu" ? "menu" : "bare-start");
    assert.equal(marathonUpdateKind({ message: { ...message, from: { id: 456 } } }), null);
    assert.equal(marathonUpdateKind({ message: { ...message, chat: { id: 123, type: "group" } } }), null);
    assert.equal(marathonUpdateKind({ message: { ...message, text: "/start mth_token" } }), null);
  }
});
