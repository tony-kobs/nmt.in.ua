import assert from "node:assert/strict";
import test from "node:test";
import { drainTelegramOutbox } from "./outbox";

test("outbox keeps per-chat order after a failure and still serves other chats", async () => {
  const rows = [
    { id: 1, chatId: "a", payload: JSON.stringify({ chatId: "a", text: "a1" }), attempts: 1 },
    { id: 2, chatId: "a", payload: JSON.stringify({ chatId: "a", text: "a2" }), attempts: 1 },
    { id: 3, chatId: "b", payload: JSON.stringify({ chatId: "b", text: "b1" }), attempts: 1 },
  ];
  const finished: Array<[number, string, boolean]> = [];
  const delivered: string[] = [];
  let claims = 0;
  const sent = await drainTelegramOutbox({
    budgetMs: 10_000,
    deps: {
      token: "t",
      now: () => 0,
      claim: async () => (claims++ === 0 ? rows : []),
      finish: async (id, status, notBefore) => { finished.push([id, status, notBefore != null]); },
      deliver: async (replies) => {
        delivered.push(replies[0]!.text);
        return { sent: replies[0]!.text === "a1" ? 0 : 1, deferred: [] };
      },
    },
  });
  assert.equal(sent, 1);
  assert.deepEqual(delivered, ["a1", "b1"]);
  assert.deepEqual(finished, [[1, "pending", true], [2, "pending", true], [3, "sent", false]]);
});
