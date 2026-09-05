import assert from "node:assert/strict";
import test from "node:test";

import type { SqlConnection } from "@/lib/db/mysql";
import { getThemes } from "./getThemes";

test("getThemes returns normalized themes and releases the connection", async () => {
  let capturedSql = "";
  let released = false;

  const connection: SqlConnection = {
    beginTransaction: async () => {},
    query: async <T,>(sql: string) => {
      capturedSql = sql;

      return [
        {
          id: 8,
          code: " ALG-07-EQ ",
          name: " Рівняння ",
          description: " Основні рівняння ",
          ord: 1,
        },
      ] as T[];
    },
    execute: async () => ({ insertId: 0, affectedRows: 0 }),
    commit: async () => {},
    rollback: async () => {},
    release: () => {
      released = true;
    },
  };

  const themes = await getThemes({
    getConnection: async () => connection,
  });

  assert.match(capturedSql, /SELECT id, code, name, description, ord/);
  assert.match(capturedSql, /ORDER BY ord ASC, id ASC/);
  assert.deepEqual(themes, [
    {
      id: 8,
      code: "ALG-07-EQ",
      name: "Рівняння",
      description: "Основні рівняння",
      ord: 1,
    },
  ]);
  assert.equal(released, true);
});