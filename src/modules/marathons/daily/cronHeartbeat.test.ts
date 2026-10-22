import assert from "node:assert/strict";
import { test } from "node:test";
import { handleMarathonCronHealth, handleMarathonNotificationsProcess } from "./cronRoute";
import {
  buildCronHealth,
  cronCountsFromRun,
  type CronHealth,
} from "./cronHeartbeat";

const NOW = new Date("2026-10-26T06:25:00.000Z");

function healthRequest(header?: string): Request {
  return new Request("https://example.test/api/marathon/notifications/health", {
    method: "GET",
    headers: header ? { authorization: header } : {},
  });
}

function processRequest(header?: string): Request {
  return new Request("https://example.test/api/marathon/notifications/process", {
    method: "POST",
    headers: header ? { authorization: header } : {},
  });
}

test("cron health is ok only within 25 minutes of the last successful run", () => {
  assert.deepEqual(cronCountsFromRun({ sent: 3, skipped: 1, failed: 1 }), {
    processed: 5,
    sent: 3,
    failed: 1,
  });
  const fresh = buildCronHealth({
    now: NOW,
    ranAtMs: NOW.getTime() - 10 * 60_000,
    counts: { processed: 4, sent: 3, failed: 1 },
    pendingOutbox: 2,
    failedLast24h: 1,
  });
  assert.equal(fresh.ok, true);
  assert.equal(fresh.ageMinutes, 10);
  assert.equal(fresh.lastRunAt, "2026-10-26T06:15:00.000Z");
  assert.deepEqual(fresh.lastCounts, { processed: 4, sent: 3, failed: 1 });
  const edge = buildCronHealth({
    now: NOW,
    ranAtMs: NOW.getTime() - 25 * 60_000,
    counts: { processed: 0, sent: 0, failed: 0 },
    pendingOutbox: 0,
    failedLast24h: 0,
  });
  assert.equal(edge.ok, true);
  assert.equal(edge.ageMinutes, 25);
  const stale = buildCronHealth({
    now: NOW,
    ranAtMs: NOW.getTime() - 26 * 60_000,
    counts: { processed: 0, sent: 0, failed: 0 },
    pendingOutbox: 7,
    failedLast24h: 3,
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.ageMinutes, 26);
  assert.equal(stale.pendingOutbox, 7);
  const none = buildCronHealth({
    now: NOW,
    ranAtMs: null,
    counts: null,
    pendingOutbox: 0,
    failedLast24h: 0,
  });
  assert.deepEqual(none, {
    lastRunAt: null,
    ageMinutes: null,
    ok: false,
    lastCounts: null,
    pendingOutbox: 0,
    failedLast24h: 0,
  });
});

test("health endpoint requires the marathon cron bearer and returns the snapshot", async () => {
  const previous = process.env.MARATHON_CRON_SECRET;
  const snapshot: CronHealth = {
    lastRunAt: "2026-10-26T06:10:00.000Z",
    ageMinutes: 8,
    ok: true,
    lastCounts: { processed: 4, sent: 3, failed: 1 },
    pendingOutbox: 0,
    failedLast24h: 1,
  };
  try {
    delete process.env.MARATHON_CRON_SECRET;
    assert.equal((await handleMarathonCronHealth(healthRequest("Bearer secret"))).status, 401);
    process.env.MARATHON_CRON_SECRET = "cron-secret";
    for (const header of [undefined, "Bearer ", "Basic cron-secret", "Bearer wrong"]) {
      assert.equal((await handleMarathonCronHealth(healthRequest(header))).status, 401);
    }
    const response = await handleMarathonCronHealth(healthRequest("Bearer cron-secret"), async () => snapshot);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), snapshot);
    const failed = await handleMarathonCronHealth(healthRequest("Bearer cron-secret"), async () => {
      throw new Error("db down");
    });
    assert.equal(failed.status, 500);
  } finally {
    if (previous === undefined) delete process.env.MARATHON_CRON_SECRET;
    else process.env.MARATHON_CRON_SECRET = previous;
  }
});

test("a successful process records counts and a failed plan does not", async () => {
  const previous = process.env.MARATHON_CRON_SECRET;
  const recorded: Array<{ processed: number; sent: number; failed: number }> = [];
  const deps = {
    ensureAuth: async () => {},
    drain: async () => 2,
    deletions: async () => ({ deleted: 0, reminded: 0 }),
    record: async (counts: { processed: number; sent: number; failed: number }) => {
      recorded.push(counts);
    },
  };
  try {
    process.env.MARATHON_CRON_SECRET = "cron-secret";
    assert.equal((await handleMarathonNotificationsProcess(processRequest(), {
      ...deps,
      run: async () => ({ sent: 1, skipped: 0, failed: 0 }),
    })).status, 401);
    assert.equal(recorded.length, 0);
    const broken = await handleMarathonNotificationsProcess(processRequest("Bearer cron-secret"), {
      ...deps,
      run: async () => { throw new Error("plan failed"); },
    });
    assert.equal(broken.status, 500);
    assert.equal(recorded.length, 0);
    const ok = await handleMarathonNotificationsProcess(processRequest("Bearer cron-secret"), {
      ...deps,
      run: async () => ({ sent: 2, skipped: 1, failed: 0 }),
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get("cache-control"), "no-store");
    assert.deepEqual(recorded, [{ processed: 3, sent: 2, failed: 0 }]);
    const body = await ok.json() as { sent: number; telegramQueued: number };
    assert.equal(body.sent, 2);
    assert.equal(body.telegramQueued, 2);
    const stillOk = await handleMarathonNotificationsProcess(processRequest("Bearer cron-secret"), {
      ...deps,
      run: async () => ({ sent: 0, skipped: 0, failed: 0 }),
      record: async () => { throw new Error("write failed"); },
    });
    assert.equal(stillOk.status, 200);
  } finally {
    if (previous === undefined) delete process.env.MARATHON_CRON_SECRET;
    else process.env.MARATHON_CRON_SECRET = previous;
  }
});
