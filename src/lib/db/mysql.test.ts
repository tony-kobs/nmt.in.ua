import assert from "node:assert/strict";
import test from "node:test";
import type { Pool, PoolConnection } from "mysql2/promise";
import { getConnection, getConnectionWithTimeout, shouldPingIdleConnection, shouldRetryConnectError } from "./mysql";

/**
 * Regression test for the diagnostic-intro "stuck on Готуємо тест…" bug:
 * `acquireRawConnection` used to retry a connect-phase timeout (host
 * unreachable — a firewall silently dropping packets, a DB that's down but
 * still routable) `MAX_CONNECT_ATTEMPTS` times at the *full* `connectTimeout`
 * each, multiplying a single ~15s stall into a ~45s one (at the defaults)
 * before any error ever reached the client. An actively-refused connection
 * (ECONNREFUSED) or a dropped idle socket (ECONNRESET) fails fast and is
 * still worth retrying — only a connect-phase timeout isn't, since retrying
 * repeats the exact same wait for no benefit.
 */

test("does not retry a connect-phase timeout (host unreachable)", () => {
  assert.equal(
    shouldRetryConnectError({ code: "ETIMEDOUT" }, 1, 3),
    false,
  );
});

test("still retries a dropped-idle-socket error while attempts remain", () => {
  assert.equal(
    shouldRetryConnectError({ code: "ECONNRESET" }, 1, 3),
    true,
  );
  assert.equal(
    shouldRetryConnectError({ code: "PROTOCOL_CONNECTION_LOST" }, 2, 3),
    true,
  );
});

test("still retries a refused connection while attempts remain", () => {
  assert.equal(
    shouldRetryConnectError({ code: "ECONNREFUSED" }, 1, 3),
    true,
  );
});

test("never retries once the attempt budget is exhausted, regardless of error kind", () => {
  assert.equal(
    shouldRetryConnectError({ code: "ECONNRESET" }, 3, 3),
    false,
  );
});

test("never retries a non-transient error", () => {
  assert.equal(
    shouldRetryConnectError({ code: "ER_ACCESS_DENIED_ERROR" }, 1, 3),
    false,
  );
});

/**
 * A `ping` before every query costs a full round trip. While a student answers
 * question after question the pooled socket is handed back and taken again
 * within milliseconds, so it can only be dead if the host dropped it while
 * idle — which is what the threshold checks for.
 */
test("skips the ping for a socket released moments ago", () => {
  assert.equal(shouldPingIdleConnection(10_000, 10_500, 10_000), false);
});

test("pings a socket that sat idle past the threshold", () => {
  assert.equal(shouldPingIdleConnection(10_000, 20_000, 10_000), true);
  assert.equal(shouldPingIdleConnection(10_000, 45_000, 10_000), true);
});

test("skips the ping for a freshly opened connection", () => {
  assert.equal(shouldPingIdleConnection(undefined, 99_999, 10_000), false);
});

test("a zero threshold keeps pinging every reused socket", () => {
  assert.equal(shouldPingIdleConnection(500, 500, 0), true);
});

function fakePool() {
  const events: string[] = [];
  const raw = {
    execute: async () => { events.push("execute"); return [[{ id: 1 }], []]; },
    beginTransaction: async () => { events.push("begin"); },
    commit: async () => { events.push("commit"); },
    rollback: async () => { events.push("rollback"); },
    ping: async () => { events.push("ping"); },
    release: () => { events.push("release"); },
    destroy: () => { events.push("destroy"); },
  };
  const pool = { getConnection: async () => raw as unknown as PoolConnection };
  return { raw, pool, events };
}

async function usingPool(work: (fake: ReturnType<typeof fakePool>) => Promise<void>) {
  const dbGlobal = globalThis as typeof globalThis & { __nmtMysqlPool?: Pool };
  const previous = dbGlobal.__nmtMysqlPool;
  const fake = fakePool();
  dbGlobal.__nmtMysqlPool = fake.pool as unknown as Pool;
  try { await work(fake); } finally { dbGlobal.__nmtMysqlPool = previous; }
}

for (const method of ["query", "execute", "beginTransaction", "commit", "rollback"] as const) {
  test(`bounded ${method} destroys the socket and prevents further use after timeout`, async () => {
    await usingPool(async ({ raw, events }) => {
      const hang = () => new Promise<never>(() => {});
      if (method === "query" || method === "execute") raw.execute = hang;
      else raw[method] = hang;
      const connection = await getConnectionWithTimeout({ timeoutMs: 10 });
      await assert.rejects(method === "query" || method === "execute" ? connection[method]("SELECT 1") : connection[method](), /Database operation timed out/);
      assert.deepEqual(events, ["destroy"]);
      await assert.rejects(connection.query("SELECT 1"), /unavailable/);
      await assert.rejects(connection.rollback(), /unavailable/);
      connection.release();
      assert.deepEqual(events, ["destroy"]);
    });
  });
}

test("timed-out acquisition destroys a connection that arrives later", async () => {
  await usingPool(async ({ pool, raw, events }) => {
    let resolve!: (value: PoolConnection) => void;
    pool.getConnection = () => new Promise<PoolConnection>((done) => { resolve = done; });
    await assert.rejects(getConnectionWithTimeout({ timeoutMs: 10 }), /Database operation timed out/);
    assert.deepEqual(events, []);
    resolve(raw as unknown as PoolConnection);
    await new Promise((done) => setImmediate(done));
    assert.deepEqual(events, ["destroy"]);
  });
});

test("a late acquisition rejection is consumed after its timeout", async () => {
  await usingPool(async ({ pool, events }) => {
    let reject!: (error: Error) => void;
    pool.getConnection = () => new Promise<PoolConnection>((_, fail) => { reject = fail; });
    await assert.rejects(getConnectionWithTimeout({ timeoutMs: 10 }), /Database operation timed out/);
    reject(new Error("late failure"));
    await new Promise((done) => setImmediate(done));
    assert.deepEqual(events, []);
  });
});

test("a timed-out idle ping destroys the connection even when ping resolves later", async () => {
  const previous = process.env.DB_PING_AFTER_IDLE_MS;
  process.env.DB_PING_AFTER_IDLE_MS = "0";
  try {
    await usingPool(async ({ raw, events }) => {
      (await getConnection()).release();
      let resolvePing!: () => void;
      raw.ping = () => new Promise<void>((resolve) => { resolvePing = resolve; });
      await assert.rejects(getConnectionWithTimeout({ timeoutMs: 10 }), /Database operation timed out/);
      assert.deepEqual(events, ["release", "destroy"]);
      resolvePing();
      await new Promise((done) => setImmediate(done));
      assert.deepEqual(events, ["release", "destroy"]);
    });
  } finally {
    if (previous === undefined) delete process.env.DB_PING_AFTER_IDLE_MS;
    else process.env.DB_PING_AFTER_IDLE_MS = previous;
  }
});

test("successful bounded operations and default connections retain ordinary release behavior", async () => {
  await usingPool(async ({ events }) => {
    for (const connection of [await getConnectionWithTimeout({ timeoutMs: 100 }), await getConnection()]) {
      await connection.beginTransaction();
      assert.deepEqual(await connection.query("SELECT 1"), [{ id: 1 }]);
      await connection.commit();
      await connection.rollback();
      connection.release();
    }
    assert.deepEqual(events, ["begin", "execute", "commit", "rollback", "release", "begin", "execute", "commit", "rollback", "release"]);
  });
});

test("invalid operation timeouts fail before acquiring a connection", async () => {
  await usingPool(async ({ pool }) => {
    pool.getConnection = async () => { assert.fail("invalid timeout must not acquire"); };
    for (const timeoutMs of [0, -1, 0.5, NaN, Infinity, 2_147_483_648]) {
      await assert.rejects(getConnectionWithTimeout({ timeoutMs }), /Invalid database operation timeout/);
    }
  });
});

test("an expired shared deadline prevents acquisition and subsequent connection operations", async () => {
  await usingPool(async ({ events }) => {
    await assert.rejects(getConnectionWithTimeout({ timeoutMs: 100, deadlineMs: Date.now() - 1 }), /timed out/);
    const connection = await getConnectionWithTimeout({ timeoutMs: 100, deadlineMs: Date.now() + 20 });
    await new Promise((resolve) => setTimeout(resolve, 30));
    await assert.rejects(connection.query("SELECT 1"), /timed out/);
    assert.deepEqual(events, ["destroy"]);
    connection.release();
    assert.deepEqual(events, ["destroy"]);
  });
});

test("the shared deadline bounds an in-flight operation even with a longer per-operation timeout", async () => {
  await usingPool(async ({ raw, events }) => {
    raw.commit = () => new Promise<never>(() => {});
    const connection = await getConnectionWithTimeout({ timeoutMs: 10_000, deadlineMs: Date.now() + 20 });
    await assert.rejects(connection.commit(), /timed out/);
    assert.deepEqual(events, ["destroy"]);
  });
});
