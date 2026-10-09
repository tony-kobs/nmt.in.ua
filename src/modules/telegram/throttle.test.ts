import assert from "node:assert/strict";
import test from "node:test";
import { sendThrottled } from "./throttle";

function clock() {
  let t = 0;
  return {
    now: () => t,
    sleep: async (ms: number) => {
      t += ms;
    },
    time: () => t,
  };
}

test("429 retry_after waits once inside the budget and then sends", async () => {
  const time = clock();
  let calls = 0;
  const result = await sendThrottled(["a"], {
    chatId: () => "1",
    now: time.now,
    sleep: time.sleep,
    budgetMs: 5_000,
    startedAt: 0,
    perChatGapMs: 0,
    send: async () => {
      calls += 1;
      return calls === 1 ? { ok: false, retryAfter: 2 } : { ok: true };
    },
  });
  assert.deepEqual(result.sent, ["a"]);
  assert.deepEqual(result.deferred, []);
  assert.equal(calls, 2);
  assert.equal(time.time(), 2000);
});

test("429 beyond the budget defers the message instead of blocking", async () => {
  const time = clock();
  let calls = 0;
  const result = await sendThrottled(["a", "b"], {
    chatId: () => "1",
    now: time.now,
    sleep: time.sleep,
    budgetMs: 1_000,
    startedAt: 0,
    perChatGapMs: 0,
    send: async () => {
      calls += 1;
      return { ok: false, retryAfter: 30 };
    },
  });
  assert.deepEqual(result.sent, []);
  assert.deepEqual(result.deferred, ["a", "b"]);
  assert.equal(calls, 1);
  assert.equal(time.time(), 0);
});

test("global pace waits once the per-second window is full", async () => {
  const time = clock();
  const result = await sendThrottled(["1", "2", "3"], {
    chatId: (item) => item,
    now: time.now,
    sleep: time.sleep,
    budgetMs: 5_000,
    startedAt: 0,
    globalPerSecond: 2,
    perChatGapMs: 0,
    send: async () => ({ ok: true }),
  });
  assert.deepEqual(result.sent, ["1", "2", "3"]);
  assert.ok(time.time() >= 1000);
});
