/**
 * Isolated real-MySQL coverage for the 016 migration's backfill behavior and
 * for `SELECT ... FOR UPDATE` locking across the new expiration guards.
 *
 * Self-gated: skips cleanly (via `test.skip`) whenever a live database isn't
 * configured, so `npm test` never fails in an environment without one (this
 * repo's onboarding doc already notes DB-backed tests need a real MySQL).
 * Run for real with the same `DB_*` env vars `.env.local` sets for `npm run
 * dev` (see `src/lib/db/mysql.ts`).
 *
 * Uses a throwaway scratch table — never the real `task_sessions` — so this
 * is safe to run against a shared dev database without touching real rows.
 */
import assert from "node:assert/strict";
import test from "node:test";

const hasLiveDb = Boolean(process.env.DB_HOST);

const SCRATCH_TABLE = "session_expiry_integration_scratch";

async function withConnection<T>(fn: (conn: import("@/lib/db/mysql").SqlConnection) => Promise<T>): Promise<T> {
  const { getConnection } = await import("@/lib/db/mysql");
  const connection = await getConnection();
  try {
    return await fn(connection);
  } finally {
    connection.release();
  }
}

async function setupScratchTable(): Promise<void> {
  await withConnection(async (conn) => {
    await conn.execute(`DROP TABLE IF EXISTS ${SCRATCH_TABLE}`);
    // Mirrors the pre-migration shape: no expire_time column yet.
    await conn.execute(`
      CREATE TABLE ${SCRATCH_TABLE} (
        id INT PRIMARY KEY AUTO_INCREMENT,
        session_status INT NOT NULL,
        start_time INT UNSIGNED NOT NULL
      ) ENGINE=InnoDB
    `);
  });
}

async function teardownScratchTable(): Promise<void> {
  await withConnection(async (conn) => {
    await conn.execute(`DROP TABLE IF EXISTS ${SCRATCH_TABLE}`);
  });
}

test(
  "016 migration pattern: ADD COLUMN + backfill sets expire_time only on rows still at the sentinel",
  { skip: !hasLiveDb },
  async () => {
    await setupScratchTable();
    try {
      await withConnection(async (conn) => {
        await conn.execute(`INSERT INTO ${SCRATCH_TABLE} (session_status, start_time) VALUES (2, 0), (1, 1700000000)`);

        // Same statements as scripts/sql/016_task_sessions_expire_time.sql,
        // applied to the scratch table.
        await conn.execute(
          `ALTER TABLE ${SCRATCH_TABLE} ADD COLUMN expire_time INT UNSIGNED NOT NULL DEFAULT 0 AFTER start_time`,
        );
        await conn.execute(
          `UPDATE ${SCRATCH_TABLE} SET expire_time = UNIX_TIMESTAMP() WHERE expire_time = 0`,
        );

        const rows = await conn.query<{ id: number; expire_time: number }>(
          `SELECT id, expire_time FROM ${SCRATCH_TABLE} ORDER BY id ASC`,
        );

        assert.equal(rows.length, 2);
        const nowSec = Math.floor(Date.now() / 1000);
        for (const row of rows) {
          // Backfilled to "now" (cutover), never left at the 0 sentinel.
          assert.ok(row.expire_time > 0);
          assert.ok(Math.abs(row.expire_time - nowSec) < 30);
        }
      });
    } finally {
      await teardownScratchTable();
    }
  },
);

test(
  "016 migration backfill is a safe no-op to re-run: does not touch a row already past the sentinel",
  { skip: !hasLiveDb },
  async () => {
    await setupScratchTable();
    try {
      await withConnection(async (conn) => {
        await conn.execute(`ALTER TABLE ${SCRATCH_TABLE} ADD COLUMN expire_time INT UNSIGNED NOT NULL DEFAULT 0 AFTER start_time`);
        await conn.execute(`INSERT INTO ${SCRATCH_TABLE} (session_status, start_time, expire_time) VALUES (2, 0, 12345)`);

        await conn.execute(`UPDATE ${SCRATCH_TABLE} SET expire_time = UNIX_TIMESTAMP() WHERE expire_time = 0`);

        const [row] = await conn.query<{ expire_time: number }>(
          `SELECT expire_time FROM ${SCRATCH_TABLE} WHERE id = 1`,
        );
        assert.equal(row!.expire_time, 12345);
      });
    } finally {
      await teardownScratchTable();
    }
  },
);

test(
  "FOR UPDATE serializes two concurrent reads of the same row across the expiry boundary",
  { skip: !hasLiveDb },
  async () => {
    await setupScratchTable();
    try {
      const { insertId } = await withConnection((conn) =>
        conn.execute(`INSERT INTO ${SCRATCH_TABLE} (session_status, start_time) VALUES (2, 0)`),
      );

      const { getConnection } = await import("@/lib/db/mysql");
      const connA = await getConnection();
      const connB = await getConnection();

      const order: string[] = [];
      try {
        await connA.beginTransaction();
        await connA.query(`SELECT id FROM ${SCRATCH_TABLE} WHERE id = ? FOR UPDATE`, [insertId]);
        order.push("A-locked");

        const bWaiting = (async () => {
          await connB.beginTransaction();
          await connB.query(`SELECT id FROM ${SCRATCH_TABLE} WHERE id = ? FOR UPDATE`, [insertId]);
          order.push("B-locked");
          await connB.commit();
        })();

        // B must still be blocked shortly after A took the lock.
        await new Promise((resolve) => setTimeout(resolve, 200));
        assert.deepEqual(order, ["A-locked"]);

        await connA.commit();
        await bWaiting;

        assert.deepEqual(order, ["A-locked", "B-locked"]);
      } finally {
        connA.release();
        connB.release();
      }
    } finally {
      await teardownScratchTable();
    }
  },
);
