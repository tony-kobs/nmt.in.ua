import assert from "node:assert/strict";
import test from "node:test";

import type { SqlConnection } from "@/lib/db/mysql";
import {
  ensureSchemaOnce,
  resetSchemaGuardForTests,
  schemaMigrationsApplied,
  setSchemaLockClockForTests,
} from "./schemaGuard";

function connection(query: SqlConnection["query"]): SqlConnection {
  return {
    beginTransaction: async () => undefined,
    commit: async () => undefined,
    rollback: async () => undefined,
    release: () => undefined,
    discard: () => undefined,
    query,
    execute: async () => ({ insertId: 0, affectedRows: 1 }),
  };
}

test.beforeEach(() => {
  resetSchemaGuardForTests();
});

test("schemaMigrationsApplied is true only when every version is recorded", async () => {
  const conn = connection(async <T,>() => [{ version: "040_daily_marathon.sql" }] as T[]);
  assert.equal(await schemaMigrationsApplied(conn, ["040_daily_marathon.sql"]), true);
  assert.equal(
    await schemaMigrationsApplied(conn, ["040_daily_marathon.sql", "045_cabinet_scope_full.sql"]),
    false,
  );
});

test("schemaMigrationsApplied treats a missing table as not applied", async () => {
  const conn = connection(async () => {
    const error = new Error("missing") as Error & { errno: number };
    error.errno = 1146;
    throw error;
  });
  assert.equal(await schemaMigrationsApplied(conn, ["001_app_users.sql"]), false);
});

test("ensureSchemaOnce skips DDL when the versions are already recorded", async () => {
  let migrated = 0;
  const queries: string[] = [];
  await ensureSchemaOnce(
    "applied",
    ["001_app_users.sql"],
    async () =>
      connection(async <T,>(sql: string) => {
        queries.push(sql);
        return [{ version: "001_app_users.sql" }] as T[];
      }),
    async () => {
      migrated += 1;
    },
  );
  assert.equal(migrated, 0);
  assert.equal(queries.some((sql) => sql.includes("GET_LOCK")), false);
});

function fastLockClock() {
  let now = 0;
  setSchemaLockClockForTests({
    budgetMs: 15_000,
    pauseMs: 1_000,
    attemptSec: 2,
    now: () => now,
    sleep: async (ms) => {
      now += ms;
    },
  });
}

test("ensureSchemaOnce retries a busy schema lock with short GET_LOCK attempts", async () => {
  fastLockClock();
  const timeouts: number[] = [];
  let migrated = 0;
  await assert.rejects(
    () =>
      ensureSchemaOnce(
        "busy",
        ["001_app_users.sql"],
        async () =>
          connection(async <T,>(sql: string, params?: unknown[]) => {
            if (sql.includes("schema_migrations")) return [] as T[];
            if (sql.includes("GET_LOCK")) timeouts.push(Number(params?.[1]));
            return [{ got: 0 }] as T[];
          }),
        async () => {
          migrated += 1;
        },
      ),
    /Schema migration lock is busy/,
  );
  assert.equal(migrated, 0);
  assert.ok(timeouts.length > 1);
  assert.ok(timeouts.every((seconds) => Number.isInteger(seconds) && seconds >= 0 && seconds < 5));
});

test("ensureSchemaOnce migrates once a later short attempt gets the schema lock", async () => {
  fastLockClock();
  let locks = 0;
  let migrated = 0;
  await ensureSchemaOnce(
    "retry-grant",
    ["001_app_users.sql"],
    async () =>
      connection(async <T,>(sql: string) => {
        if (sql.includes("schema_migrations")) return [] as T[];
        if (sql.includes("GET_LOCK")) {
          locks += 1;
          return [{ got: locks >= 2 ? 1 : 0 }] as T[];
        }
        if (sql.includes("RELEASE_LOCK")) return [{ released: 1 }] as T[];
        return [] as T[];
      }),
    async () => {
      migrated += 1;
    },
  );
  assert.equal(locks, 2);
  assert.equal(migrated, 1);
});

test("ensureSchemaOnce drops the socket when the schema lock stays held", async () => {
  let released = 0;
  let discarded = 0;
  const conn = connection(async <T,>(sql: string) => {
    if (sql.includes("schema_migrations")) return [] as T[];
    if (sql.includes("RELEASE_LOCK")) return [{ released: 0 }] as T[];
    return [{ got: 1 }] as T[];
  });
  conn.release = () => {
    released += 1;
  };
  conn.discard = () => {
    discarded += 1;
  };
  await ensureSchemaOnce(
    "leaked",
    ["001_app_users.sql"],
    async () => conn,
    async () => undefined,
  );
  assert.equal(discarded, 1);
  assert.equal(released, 0);
});

test("ensureSchemaOnce drops the socket when releasing the schema lock throws", async () => {
  let discarded = 0;
  const conn = connection(async <T,>(sql: string) => {
    if (sql.includes("schema_migrations")) return [] as T[];
    if (sql.includes("RELEASE_LOCK")) throw new Error("gone");
    return [{ got: 1 }] as T[];
  });
  conn.discard = () => {
    discarded += 1;
  };
  await ensureSchemaOnce(
    "release-threw",
    ["001_app_users.sql"],
    async () => conn,
    async () => undefined,
  );
  assert.equal(discarded, 1);
});

test("ensureSchemaOnce still migrates once when the driver does not report the lock", async () => {
  let migrated = 0;
  await ensureSchemaOnce(
    "unknown-lock",
    ["001_app_users.sql"],
    async () =>
      connection(async <T,>(sql: string) => {
        if (sql.includes("schema_migrations")) return [] as T[];
        return [] as T[];
      }),
    async () => {
      migrated += 1;
    },
  );
  assert.equal(migrated, 1);
});

test("parallel ensureSchemaOnce calls share one migration", async () => {
  let migrated = 0;
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const run = () =>
    ensureSchemaOnce(
      "shared",
      ["001_app_users.sql"],
      async () =>
        connection(async <T,>(sql: string) => {
          if (sql.includes("schema_migrations")) return [] as T[];
          return [{ got: 1 }] as T[];
        }),
      async () => {
        migrated += 1;
        await gate;
      },
    );
  const first = run();
  const second = run();
  release();
  await Promise.all([first, second]);
  assert.equal(migrated, 1);
});
