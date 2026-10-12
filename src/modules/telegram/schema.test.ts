import assert from "node:assert/strict";
import { test } from "node:test";
import type { SqlConnection } from "@/lib/db/mysql";
import { ensureTelegramSchema } from "./schema";

test("Telegram schema initializes preferences after accounts, retries failures, and coalesces repeated calls", async () => {
  const statements: string[] = [];
  let failPreferences = true;
  let releases = 0;
  const connection: SqlConnection = {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => { releases++; },
    query: async <T>() => [{ COLUMN_NAME: "existing", INDEX_NAME: "existing" }] as T[],
    execute: async (sql) => {
      statements.push(sql);
      if (sql.includes("CREATE TABLE IF NOT EXISTS telegram_notification_preferences") && failPreferences) {
        failPreferences = false;
        throw new Error("preferences schema unavailable");
      }
      return { insertId: 0, affectedRows: 0 };
    },
  };
  const getConnection = async () => connection;
  await assert.rejects(ensureTelegramSchema(getConnection), /preferences schema unavailable/);
  assert.equal(releases, 2);
  await Promise.all([ensureTelegramSchema(getConnection), ensureTelegramSchema(getConnection)]);
  const count = statements.length;
  await ensureTelegramSchema(getConnection);
  assert.equal(statements.length, count);
  assert.equal(releases, 3);
  const usersIndex = statements.findIndex((sql) => sql.includes("CREATE TABLE IF NOT EXISTS app_users"));
  const accountsIndex = statements.findIndex((sql) => sql.includes("CREATE TABLE IF NOT EXISTS user_telegram_accounts"));
  const preferencesIndex = statements.findIndex((sql) => sql.includes("CREATE TABLE IF NOT EXISTS telegram_notification_preferences"));
  assert.ok(usersIndex >= 0 && usersIndex < accountsIndex && accountsIndex < preferencesIndex);
  assert.equal(statements.filter((sql) => sql.includes("CREATE TABLE IF NOT EXISTS telegram_notification_preferences")).length, 2);
  assert.match(statements[preferencesIndex], /daily_reminder TINYINT\(1\) NOT NULL DEFAULT 0/);
  assert.match(statements[preferencesIndex], /FOREIGN KEY \(account_id\)\s+REFERENCES user_telegram_accounts \(id\) ON DELETE CASCADE/);
  assert.ok(statements.some((sql) => /ALTER TABLE telegram_notification_preferences ALTER COLUMN daily_reminder SET DEFAULT 0/.test(sql)));
  assert.equal(statements.some((sql) => /^(UPDATE|DELETE|DROP)\s/i.test(sql.trim())), false);
});
