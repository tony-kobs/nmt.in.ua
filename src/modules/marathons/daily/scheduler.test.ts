import assert from "node:assert/strict";
import { test } from "node:test";

import type { SqlConnection } from "@/lib/db/mysql";
import {
  createMysqlNotifyLock,
  createNotifyGate,
  MARATHON_NOTIFY_LOCK,
} from "./notifyLock";
import {
  marathonSchedulerEnabled,
  resetMarathonSchedulerForTests,
  SCHEDULER_INTERVAL_MS,
  startMarathonScheduler,
} from "./scheduler";

test("scheduler is on in production unless the flag says off", () => {
  assert.equal(marathonSchedulerEnabled({ NODE_ENV: "production" }), true);
  assert.equal(marathonSchedulerEnabled({ NODE_ENV: "production", MARATHON_SCHEDULER: "off" }), false);
  assert.equal(marathonSchedulerEnabled({ NODE_ENV: "development" }), false);
  assert.equal(marathonSchedulerEnabled({ NODE_ENV: "test" }), false);
  assert.equal(marathonSchedulerEnabled({ NODE_ENV: "test", MARATHON_SCHEDULER: "on" }), true);
  assert.equal(marathonSchedulerEnabled({ NODE_ENV: "development", MARATHON_SCHEDULER: "on" }), true);
});

test("a second tick does not overlap and a refused db lock skips the work", async () => {
  let runs = 0;
  let release: (() => void) | undefined;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  const gate = createNotifyGate({
    tryLock: async () => true,
    unlock: async () => undefined,
  });
  const first = gate.run(async () => {
    runs += 1;
    await hold;
  });
  const second = await gate.run(async () => {
    runs += 1;
  });
  assert.deepEqual(second, { skipped: true });
  assert.equal(runs, 1);
  release?.();
  assert.deepEqual(await first, { skipped: false, value: undefined });
  await gate.run(async () => {
    runs += 1;
  });
  assert.equal(runs, 2);

  let lockedRuns = 0;
  const busy = createNotifyGate({
    tryLock: async () => false,
    unlock: async () => {
      throw new Error("unlock should not run");
    },
  });
  assert.deepEqual(await busy.run(async () => {
    lockedRuns += 1;
  }), { skipped: true });
  assert.equal(lockedRuns, 0);
  const open = createNotifyGate({
    tryLock: async () => true,
    unlock: async () => undefined,
  });
  assert.equal((await open.run(async () => 7)).skipped, false);
});

test("a thrown tick releases the gate so the next tick can run", async () => {
  let unlocks = 0;
  const gate = createNotifyGate({
    tryLock: async () => true,
    unlock: async () => {
      unlocks += 1;
    },
  });
  await assert.rejects(gate.run(async () => {
    throw new Error("tick blew up");
  }), /tick blew up/);
  assert.equal(unlocks, 1);
  const again = await gate.run(async () => "ok");
  assert.deepEqual(again, { skipped: false, value: "ok" });
  assert.equal(unlocks, 2);
});

test("mysql lock runs the work only when GET_LOCK is granted and always releases", async () => {
  const calls: string[] = [];
  function connection(got: number): SqlConnection {
    return {
      beginTransaction: async () => undefined,
      commit: async () => undefined,
      rollback: async () => undefined,
      release: () => {
        calls.push("release");
      },
      query: async (sql: string, values?: unknown[]) => {
        calls.push(`${sql} ${(values ?? []).join(",")}`);
        if (sql.includes("GET_LOCK")) return [{ got }] as never;
        return [] as never;
      },
      execute: async () => ({ insertId: 0, affectedRows: 0 }),
    };
  }
  const granted = createMysqlNotifyLock(async () => connection(1));
  assert.equal(await granted.tryLock(), true);
  assert.match(calls[0] ?? "", new RegExp(MARATHON_NOTIFY_LOCK));
  await granted.unlock();
  assert.equal(calls.some((sql) => sql.includes("RELEASE_LOCK")), true);
  assert.equal(calls.at(-1), "release");

  const deniedCalls: string[] = [];
  const denied = createMysqlNotifyLock(async () => ({
    ...connection(0),
    query: async (sql: string, values?: unknown[]) => {
      deniedCalls.push(`${sql} ${(values ?? []).join(",")}`);
      return [{ got: 0 }] as never;
    },
    release: () => {
      deniedCalls.push("release");
    },
  }));
  assert.equal(await denied.tryLock(), false);
  assert.deepEqual(deniedCalls, [deniedCalls[0], "release"]);
  assert.match(deniedCalls[0] ?? "", /GET_LOCK/);
});

test("the scheduler starts one immediate tick and one 60s interval", () => {
  resetMarathonSchedulerForTests();
  const previousPhase = process.env.NEXT_PHASE;
  delete process.env.NEXT_PHASE;
  const ticks: number[] = [];
  let scheduled = 0;
  try {
    assert.equal(startMarathonScheduler({ enabled: false, tick: async () => undefined }), false);
    assert.equal(ticks.length, 0);
    const started = startMarathonScheduler({
      enabled: true,
      tick: async () => {
        ticks.push(1);
      },
      schedule: (fn, ms) => {
        scheduled += 1;
        assert.equal(ms, SCHEDULER_INTERVAL_MS);
        assert.equal(typeof fn, "function");
        return { unref() {} };
      },
    });
    assert.equal(started, true);
    assert.equal(ticks.length, 1);
    assert.equal(scheduled, 1);
    assert.equal(startMarathonScheduler({
      enabled: true,
      tick: async () => {
        ticks.push(1);
      },
      schedule: () => {
        scheduled += 1;
        return {};
      },
    }), false);
    assert.equal(ticks.length, 1);
    assert.equal(scheduled, 1);
  } finally {
    if (previousPhase === undefined) delete process.env.NEXT_PHASE;
    else process.env.NEXT_PHASE = previousPhase;
    resetMarathonSchedulerForTests();
  }
});
