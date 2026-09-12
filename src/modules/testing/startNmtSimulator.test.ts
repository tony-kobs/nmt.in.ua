import assert from "node:assert/strict";
import test from "node:test";
import type { SqlConnection } from "@/lib/db/mysql";
import {
  startNmtSimulator,
  StartNmtSimulatorError,
  resolveNmtVariantId,
  TASK_TYPE_NMT,
} from "./startNmtSimulator";

function makeConnection(options: {
  variantId?: number;
  taskIds?: number[];
  randomEmpty?: boolean;
}) {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const taskIds = options.taskIds ?? [11, 12, 13];
  const variantId = options.variantId ?? 7;

  const connection: SqlConnection = {
    beginTransaction: async () => {},
    query: async <T,>(sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes("FROM nmt_variants") && sql.includes("is_published = 1") && !sql.includes("id = ?")) {
        return (options.randomEmpty ? [] : [{ id: variantId }]) as T[];
      }
      if (sql.includes("FROM nmt_variants") && sql.includes("id = ?")) {
        return [{ id: variantId, tasks_number: taskIds.length }] as T[];
      }
      if (sql.includes("FROM nmt_variant_tasks")) {
        return taskIds.map((id) => ({ id })) as T[];
      }
      return [] as T[];
    },
    execute: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      if (sql.includes("INSERT INTO task_sessions")) {
        return { insertId: 99, affectedRows: 1 };
      }
      if (sql.includes("INSERT INTO tasks2session")) {
        return { insertId: 0, affectedRows: taskIds.length };
      }
      return { insertId: 0, affectedRows: 0 };
    },
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  };

  return { connection, calls, taskIds, variantId };
}

test("resolveNmtVariantId accepts random and positive ids", () => {
  assert.equal(resolveNmtVariantId("random"), "random");
  assert.equal(resolveNmtVariantId(3), 3);
  assert.throws(
    () => resolveNmtVariantId(0),
    (error: unknown) =>
      error instanceof StartNmtSimulatorError && error.code === "invalid_input",
  );
});

test("startNmtSimulator loads tasks by variant ord, not quiz_tasks RAND", async () => {
  const { connection, calls, taskIds, variantId } = makeConnection({});
  const result = await startNmtSimulator(1, variantId, {
    getConnection: async () => connection,
  });

  assert.equal(result.sessionId, 99);
  assert.equal(result.variantId, variantId);
  assert.deepEqual(result.taskIds, taskIds);
  assert.ok(calls.some((c) => c.sql.includes("FROM nmt_variant_tasks")));
  assert.ok(calls.every((c) => !c.sql.includes("FROM quiz_tasks")));
  assert.ok(
    calls.some(
      (c) =>
        c.sql.includes("INSERT INTO tasks2session") &&
        c.params?.includes(TASK_TYPE_NMT),
    ),
  );
});

test("startNmtSimulator sets expire_time to now + 86400 from the injected clock", async () => {
  const { connection, calls, variantId } = makeConnection({});
  const now = 1_700_000_000;

  await startNmtSimulator(1, variantId, {
    getConnection: async () => connection,
    nowSec: () => now,
  });

  const sessionInsert = calls.find((c) => c.sql.includes("INSERT INTO task_sessions"));
  assert.ok(sessionInsert);
  assert.equal(sessionInsert!.params?.at(-1), now + 86400);
});

test("startNmtSimulator rejects a missing variant", async () => {
  const { connection } = makeConnection({ taskIds: [] });
  connection.query = async <T,>(sql: string) => {
    if (sql.includes("FROM nmt_variants") && sql.includes("id = ?")) {
      return [] as T[];
    }
    return [] as T[];
  };

  await assert.rejects(
    () =>
      startNmtSimulator(1, 404, {
        getConnection: async () => connection,
      }),
    (error: unknown) =>
      error instanceof StartNmtSimulatorError &&
      error.code === "variant_not_found",
  );
});
