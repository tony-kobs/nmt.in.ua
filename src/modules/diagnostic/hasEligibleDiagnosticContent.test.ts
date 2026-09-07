import assert from "node:assert/strict";
import test from "node:test";
import type { SqlConnection } from "@/lib/db/mysql";
import { hasEligibleDiagnosticContent } from "./hasEligibleDiagnosticContent";

function makeConnection(eligibleThemeIds: number[]) {
  let released = false;
  const connection: SqlConnection = {
    beginTransaction: async () => {},
    query: async <T,>(sql: string) => {
      if (sql.includes("FROM themes")) {
        return eligibleThemeIds.map((id) => ({ theme_id: id })) as unknown as T[];
      }
      return [] as T[];
    },
    execute: async () => ({ insertId: 0, affectedRows: 0 }),
    commit: async () => {},
    rollback: async () => {},
    release: () => {
      released = true;
    },
  };
  return { connection, isReleased: () => released };
}

test("returns true when at least one theme is eligible", async () => {
  const mock = makeConnection([3]);
  const result = await hasEligibleDiagnosticContent({
    getConnection: async () => mock.connection,
  });
  assert.equal(result, true);
  assert.ok(mock.isReleased(), "connection must be released");
});

test("returns false when the catalog has no eligible theme (empty, not an error)", async () => {
  const mock = makeConnection([]);
  const result = await hasEligibleDiagnosticContent({
    getConnection: async () => mock.connection,
  });
  assert.equal(result, false);
  assert.ok(mock.isReleased(), "connection must be released");
});

test("releases the connection and propagates the error on a DB failure", async () => {
  let released = false;
  const connection: SqlConnection = {
    beginTransaction: async () => {},
    query: async () => {
      throw new Error("connection lost");
    },
    execute: async () => ({ insertId: 0, affectedRows: 0 }),
    commit: async () => {},
    rollback: async () => {},
    release: () => {
      released = true;
    },
  };

  await assert.rejects(
    () => hasEligibleDiagnosticContent({ getConnection: async () => connection }),
    /connection lost/,
  );
  assert.ok(released, "connection must still be released on error");
});
