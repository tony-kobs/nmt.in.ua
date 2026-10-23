import assert from "node:assert/strict";
import { test } from "node:test";
import { handleMarathonCronHealth, handleMarathonNotificationsProcess } from "./cronRoute";
import {
  buildCronHealth,
  cronCountsFromRun,
  SCHEDULER_HISTORY_MS,
  writeSchedulerRun,
  type CronHealth,
  type SchedulerRunInput,
} from "./cronHeartbeat";
import { logSchedulerTick } from "./cronRoute";
import type { SqlConnection } from "@/lib/db/mysql";

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

test("cron health is ok only within 5 minutes of the last successful run", () => {
  assert.deepEqual(cronCountsFromRun({ sent: 3, skipped: 1, failed: 1 }), {
    processed: 5,
    sent: 3,
    failed: 1,
  });
  const fresh = buildCronHealth({
    now: NOW,
    ranAtMs: NOW.getTime() - 4 * 60_000,
    counts: { processed: 4, sent: 3, failed: 1 },
    pendingOutbox: 2,
    failedLast24h: 1,
  });
  assert.equal(fresh.ok, true);
  assert.equal(fresh.ageMinutes, 4);
  assert.equal(fresh.lastRunAt, "2026-10-26T06:21:00.000Z");
  assert.deepEqual(fresh.lastCounts, { processed: 4, sent: 3, failed: 1 });
  const edge = buildCronHealth({
    now: NOW,
    ranAtMs: NOW.getTime() - 5 * 60_000,
    counts: { processed: 0, sent: 0, failed: 0 },
    pendingOutbox: 0,
    failedLast24h: 0,
  });
  assert.equal(edge.ok, true);
  assert.equal(edge.ageMinutes, 5);
  const justOver = buildCronHealth({
    now: NOW,
    ranAtMs: NOW.getTime() - 5 * 60_000 - 1,
    counts: { processed: 0, sent: 0, failed: 0 },
    pendingOutbox: 0,
    failedLast24h: 0,
  });
  assert.equal(justOver.ok, false);
  const stale = buildCronHealth({
    now: NOW,
    ranAtMs: NOW.getTime() - 6 * 60_000,
    counts: { processed: 0, sent: 0, failed: 0 },
    pendingOutbox: 7,
    failedLast24h: 3,
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.ageMinutes, 6);
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
    const stale = await handleMarathonCronHealth(healthRequest("Bearer cron-secret"), async () => ({
      ...snapshot,
      ok: false,
      ageMinutes: 6,
    }));
    assert.equal(stale.status, 503);
    assert.equal(stale.headers.get("cache-control"), "no-store");
    assert.equal((await stale.json()).ok, false);
    const failed = await handleMarathonCronHealth(healthRequest("Bearer cron-secret"), async () => {
      throw new Error("db down");
    });
    assert.equal(failed.status, 500);
  } finally {
    if (previous === undefined) delete process.env.MARATHON_CRON_SECRET;
    else process.env.MARATHON_CRON_SECRET = previous;
  }
});

test("a successful process records history and a failed plan records the error", async () => {
  const previous = process.env.MARATHON_CRON_SECRET;
  const recorded: SchedulerRunInput[] = [];
  const lines: string[] = [];
  const deps = {
    ensureAuth: async () => {},
    drain: async () => 2,
    deletions: async () => ({ deleted: 0, reminded: 0 }),
    record: async (input: SchedulerRunInput) => {
      recorded.push(input);
    },
    log: (line: string) => {
      lines.push(line);
    },
    exclusive: async <T>(work: () => Promise<T>) => ({ skipped: false as const, value: await work() }),
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
      drain: async () => 0,
    });
    assert.equal(broken.status, 500);
    assert.equal(recorded.length, 1);
    assert.equal(recorded[0]?.error, "plan failed");
    assert.equal(recorded[0]?.source, "http");
    assert.equal(lines.length, 0);
    const ok = await handleMarathonNotificationsProcess(processRequest("Bearer cron-secret"), {
      ...deps,
      run: async () => ({ sent: 2, skipped: 1, failed: 0 }),
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get("cache-control"), "no-store");
    assert.equal(recorded[1]?.processed, 3);
    assert.equal(recorded[1]?.sent, 2);
    assert.equal(recorded[1]?.failed, 0);
    assert.equal(recorded[1]?.error, null);
    assert.equal(recorded[1]?.source, "http");
    assert.ok((recorded[1]?.durationMs ?? -1) >= 0);
    assert.deepEqual(lines, [
      "marathon scheduler source=http processed=3 sent=2 failed=0 queued=2",
    ]);
    const body = await ok.json() as { sent: number; telegramQueued: number };
    assert.equal(body.sent, 2);
    assert.equal(body.telegramQueued, 2);
    const quiet = await handleMarathonNotificationsProcess(processRequest("Bearer cron-secret"), {
      ...deps,
      run: async () => ({ sent: 0, skipped: 0, failed: 0 }),
      drain: async () => 0,
    });
    assert.equal(quiet.status, 200);
    assert.equal(lines.length, 1);
    const busy = await handleMarathonNotificationsProcess(processRequest("Bearer cron-secret"), {
      ...deps,
      exclusive: async () => ({ skipped: true as const }),
    });
    assert.equal(busy.status, 200);
    assert.deepEqual(await busy.json(), { skipped: true });
    assert.equal(recorded.length, 3);
    const stillOk = await handleMarathonNotificationsProcess(processRequest("Bearer cron-secret"), {
      ...deps,
      run: async () => ({ sent: 0, skipped: 0, failed: 0 }),
      drain: async () => 0,
      record: async () => { throw new Error("write failed"); },
    });
    assert.equal(stillOk.status, 200);
  } finally {
    if (previous === undefined) delete process.env.MARATHON_CRON_SECRET;
    else process.env.MARATHON_CRON_SECRET = previous;
  }
});

test("scheduler history is appended and pruned after 7 days", async () => {
  const sql: string[] = [];
  const params: unknown[][] = [];
  const connection = {
    beginTransaction: async () => undefined,
    commit: async () => undefined,
    rollback: async () => undefined,
    release: () => undefined,
    query: async () => [],
    execute: async (statement: string, values?: unknown[]) => {
      sql.push(statement);
      params.push(values ?? []);
      return { insertId: 1, affectedRows: 1 };
    },
  } as SqlConnection;
  const ranAtMs = NOW.getTime();
  await writeSchedulerRun(connection, {
    ranAtMs,
    source: "scheduler",
    processed: 1,
    sent: 1,
    failed: 0,
    durationMs: 40,
    error: null,
  });
  assert.match(sql[0] ?? "", /INSERT INTO marathon_scheduler_runs/);
  assert.equal(sql.some((statement) => statement.includes("ON DUPLICATE KEY")), false);
  assert.match(sql[1] ?? "", /DELETE FROM marathon_scheduler_runs WHERE ran_at < \?/);
  assert.equal(params[1]?.[0], ranAtMs - SCHEDULER_HISTORY_MS);
  const logged: string[] = [];
  logSchedulerTick({ source: "scheduler", processed: 0, sent: 0, failed: 0, queued: 0 }, (line) => {
    logged.push(line);
  });
  logSchedulerTick({ source: "scheduler", processed: 0, sent: 0, failed: 1, queued: 0 }, (line) => {
    logged.push(line);
  });
  assert.deepEqual(logged, [
    "marathon scheduler source=scheduler processed=0 sent=0 failed=1 queued=0",
  ]);
});
