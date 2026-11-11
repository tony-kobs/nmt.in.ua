import assert from "node:assert/strict";
import test from "node:test";

import type { SqlConnection } from "@/lib/db/mysql";
import { listThemeLevelChoices } from "./themeLevelChoices";

test("listThemeLevelChoices counts only tasks that satisfy every rule", async () => {
  const connection: SqlConnection = {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    execute: async () => ({ insertId: 0, affectedRows: 0 }),
    query: async <T,>(sql: string) => {
      if (sql.includes("FROM theme_levels")) {
        return [
          { id: 7, theme_id: 4, name: " 2–3 дії ", sort: 0 },
          { id: 8, theme_id: 4, name: "Порожній", sort: 1 },
        ] as T[];
      }
      if (sql.includes("FROM theme_level_rules")) {
        return [
          {
            level_id: 7,
            param_id: 3,
            value_type: "int",
            bool_value: null,
            int_min: 2,
            int_max: 3,
          },
          {
            level_id: 8,
            param_id: 3,
            value_type: "int",
            bool_value: null,
            int_min: 20,
            int_max: 20,
          },
        ] as T[];
      }
      if (sql.includes("FROM quiz_tasks")) {
        return [
          { id: 10, theme_id: 4 },
          { id: 11, theme_id: 4 },
        ] as T[];
      }
      if (sql.includes("FROM quiz_task_params")) {
        return [{ task_id: 10, param_id: 3, int_value: 2 }] as T[];
      }
      return [] as T[];
    },
  };

  const choices = await listThemeLevelChoices({
    getConnection: async () => connection,
  });
  assert.deepEqual(choices, [
    { id: 7, themeId: 4, name: "2–3 дії", sort: 0, matchCount: 1 },
    { id: 8, themeId: 4, name: "Порожній", sort: 1, matchCount: 0 },
  ]);
});
