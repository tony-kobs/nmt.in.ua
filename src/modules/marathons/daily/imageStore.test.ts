import assert from "node:assert/strict";
import test from "node:test";
import type { SqlConnection } from "@/lib/db/mysql";
import { resetSchemaGuardForTests } from "@/lib/db/schemaGuard";
import { getMarathonImageByToken } from "./imageStore";

const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const token = "ab".repeat(16);

function connection(row: { day_id: number; status: string } | null): SqlConnection {
  return {
    beginTransaction: async () => undefined,
    commit: async () => undefined,
    rollback: async () => undefined,
    release: () => undefined,
    execute: async () => ({ insertId: 0, affectedRows: 0 }),
    query: async <T>(sql: string, params?: unknown[]) => {
      if (sql.includes("schema_migrations")) {
        return (params ?? []).map((version) => ({ version })) as T[];
      }
      if (sql.includes("FROM marathon_images")) {
        assert.match(sql, /m\.status/);
        assert.match(sql, /i\.day_id/);
        if (!row) return [] as T[];
        return [{ mime: "image/png", bytes: png, day_id: row.day_id, status: row.status }] as T[];
      }
      return [] as T[];
    },
  };
}

test.beforeEach(() => {
  resetSchemaGuardForTests();
});

test("GET marathon media serves a draft intro photo and still serves a day photo", async () => {
  const intro = await getMarathonImageByToken(token, async () => connection({ day_id: 0, status: "draft" }));
  assert.equal(intro?.mime, "image/png");
  assert.deepEqual(intro?.bytes, png);

  resetSchemaGuardForTests();
  const beforeStart = await getMarathonImageByToken(token, async () => connection({ day_id: 0, status: "active" }));
  assert.equal(beforeStart?.mime, "image/png");

  resetSchemaGuardForTests();
  const day = await getMarathonImageByToken(token, async () => connection({ day_id: 4, status: "draft" }));
  assert.equal(day?.mime, "image/png");
});

test("GET marathon media hides an intro photo whose course is not public", async () => {
  const hidden = await getMarathonImageByToken(token, async () => connection({ day_id: 0, status: "paused" }));
  assert.equal(hidden, null);

  resetSchemaGuardForTests();
  const missing = await getMarathonImageByToken(token, async () => connection(null));
  assert.equal(missing, null);
  assert.equal(await getMarathonImageByToken("not-a-token", async () => connection(null)), null);
});
