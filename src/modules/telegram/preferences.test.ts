import assert from "node:assert/strict";
import { test } from "node:test";
import type { SqlConnection } from "@/lib/db/mysql";
import { getNotificationPreferences, toggleNotificationPreference } from "./preferences";

test("daily reminders default off and preserve stored opt-in and opt-out", async () => {
  let rows: unknown[] = [];
  const writes: Array<{ sql: string; params: unknown[] }> = [];
  const connection: SqlConnection = {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    query: async <T>() => rows as T[],
    execute: async (sql, params = []) => {
      writes.push({ sql, params });
      return { insertId: 0, affectedRows: 1 };
    },
  };
  assert.equal((await getNotificationPreferences(connection, 7))?.dailyReminder, false);
  for (const value of [1, 0]) {
    rows = [{ account_id: 7, daily_reminder: value }];
    assert.equal((await getNotificationPreferences(connection, 7))?.dailyReminder, Boolean(value));
  }
  assert.equal(writes.length, 0);
  await toggleNotificationPreference(connection, 7, "day");
  assert.deepEqual(writes[0].params, [7, 1]);
  assert.match(writes[0].sql, /ON DUPLICATE KEY UPDATE daily_reminder = 1 - daily_reminder/);
});
