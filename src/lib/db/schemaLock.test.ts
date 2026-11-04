import assert from "node:assert/strict";
import test from "node:test";

import {
  classifySchemaLockHolder,
  isSchemaWork,
  lockAttemptSeconds,
  lockDenied,
  lockGranted,
  waitForNamedLock,
} from "../../../scripts/schema-lock.mjs";

test("a session applying DDL keeps the schema lock", () => {
  const holder = { command: "Query", timeSec: 40, info: "ALTER TABLE app_users ADD COLUMN x INT" };
  assert.equal(isSchemaWork(holder), true);
  assert.equal(classifySchemaLockHolder(holder, 60), "busy");
});

test("an idle session that still holds the schema lock is dropped", () => {
  assert.equal(
    classifySchemaLockHolder({ command: "Sleep", timeSec: 20, info: null }),
    "drop",
  );
  assert.equal(
    classifySchemaLockHolder({ command: "Sleep", timeSec: 5, info: null }, 15),
    "drop",
  );
});

test("an ordinary read on the lock holder is dropped", () => {
  assert.equal(
    classifySchemaLockHolder({
      command: "Query",
      timeSec: 1,
      info: "SELECT id FROM app_users WHERE login = 'a'",
    }),
    "drop",
  );
});

test("the migration journal check is not treated as a leaked lock", () => {
  assert.equal(
    classifySchemaLockHolder({
      command: "Query",
      timeSec: 2,
      info: "SELECT version FROM schema_migrations WHERE version IN ('001_app_users.sql')",
    }),
    "busy",
  );
});

test("a vanished lock owner is retried", () => {
  assert.equal(classifySchemaLockHolder(null), "retry");
  assert.equal(classifySchemaLockHolder({ command: "missing", timeSec: 0 }), "retry");
});

test("lock flags accept numbers, strings, and bigints", () => {
  assert.equal(lockGranted(1), true);
  assert.equal(lockGranted(BigInt(1)), true);
  assert.equal(lockGranted("1"), true);
  assert.equal(lockDenied(0), true);
  assert.equal(lockDenied(BigInt(0)), true);
  assert.equal(lockGranted(0), false);
});

test("GET_LOCK timeouts that fill the slow log are rejected", () => {
  for (const seconds of [5, 10, 15, 30]) {
    assert.throws(() => lockAttemptSeconds(seconds), /slow query log/);
  }
  assert.equal(lockAttemptSeconds(0), 0);
  assert.equal(lockAttemptSeconds(2), 2);
  assert.equal(lockAttemptSeconds(), 2);
});

test("a busy named lock retries under 5s and sleeps outside SQL until the budget ends", async () => {
  let now = 0;
  const timeouts: number[] = [];
  const sleeps: number[] = [];
  const outcome = await waitForNamedLock({
    query: async (_sql, params) => {
      const timeout = Number(params[1]);
      timeouts.push(timeout);
      now += timeout * 1000;
      return [{ got: 0 }];
    },
    name: "nmt_schema",
    budgetMs: 15_000,
    attemptSec: 2,
    pauseMs: 1_000,
    now: () => now,
    sleep: async (ms) => {
      sleeps.push(ms);
      now += ms;
    },
  });
  assert.equal(outcome.status, "busy");
  assert.ok(timeouts.length >= 4);
  assert.ok(timeouts.every((seconds) => seconds < 5));
  assert.ok(sleeps.length >= 1);
  assert.ok(sleeps.every((ms) => ms > 0));
  assert.ok(now >= 15_000);
});

test("the named lock is taken on a later short attempt", async () => {
  let now = 0;
  let calls = 0;
  const timeouts: number[] = [];
  const outcome = await waitForNamedLock({
    query: async (_sql, params) => {
      timeouts.push(Number(params[1]));
      calls += 1;
      now += 2_000;
      return [{ got: calls >= 3 ? 1 : 0 }];
    },
    name: "nmt_schema",
    budgetMs: 15_000,
    attemptSec: 2,
    pauseMs: 1_000,
    now: () => now,
    sleep: async (ms) => {
      now += ms;
    },
  });
  assert.equal(outcome.status, "acquired");
  assert.equal(outcome.attempts, 3);
  assert.deepEqual(timeouts, [2, 2, 2]);
});

test("an unrecognized GET_LOCK result is not retried", async () => {
  let calls = 0;
  const outcome = await waitForNamedLock({
    query: async () => {
      calls += 1;
      return [];
    },
    name: "nmt_schema",
    budgetMs: 15_000,
    pauseMs: 1_000,
    now: () => 0,
    sleep: async () => {
      throw new Error("should not sleep");
    },
  });
  assert.equal(outcome.status, "unknown");
  assert.equal(calls, 1);
});

test("a short remainder does not start a multi-second GET_LOCK", async () => {
  let now = 0;
  const timeouts: number[] = [];
  const outcome = await waitForNamedLock({
    query: async (_sql, params) => {
      timeouts.push(Number(params[1]));
      return [{ got: 0 }];
    },
    name: "nmt_schema",
    budgetMs: 500,
    attemptSec: 2,
    pauseMs: 100,
    now: () => now,
    sleep: async (ms) => {
      now += ms;
    },
  });
  assert.equal(outcome.status, "busy");
  assert.ok(timeouts.length >= 1);
  assert.ok(timeouts.every((seconds) => seconds === 0));
});

test("dropping a leaked holder retries without an extra pause", async () => {
  let now = 0;
  let calls = 0;
  const sleeps: number[] = [];
  const outcome = await waitForNamedLock({
    query: async () => {
      calls += 1;
      now += 2_000;
      return [{ got: calls >= 2 ? 1 : 0 }];
    },
    name: "nmt_schema",
    budgetMs: 15_000,
    attemptSec: 2,
    pauseMs: 5_000,
    now: () => now,
    sleep: async (ms) => {
      sleeps.push(ms);
      now += ms;
    },
    onBusy: async (): Promise<"retry-now"> => "retry-now",
  });
  assert.equal(outcome.status, "acquired");
  assert.equal(calls, 2);
  assert.deepEqual(sleeps, []);
});

test("a sleep that does not move the clock stops the retry", async () => {
  let calls = 0;
  const outcome = await waitForNamedLock({
    query: async () => {
      calls += 1;
      return [{ got: 0 }];
    },
    name: "nmt_schema",
    budgetMs: 15_000,
    attemptSec: 2,
    pauseMs: 1_000,
    now: () => 0,
    sleep: async () => undefined,
  });
  assert.equal(outcome.status, "busy");
  assert.equal(calls, 1);
});
