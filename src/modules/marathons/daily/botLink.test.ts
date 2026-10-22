import assert from "node:assert/strict";
import test from "node:test";

import type { SqlConnection } from "@/lib/db/mysql";
import { resetSchemaGuardForTests } from "@/lib/db/schemaGuard";
import { consumeMarathonStart } from "./botLink";

const recordedVersions = [
  "035_telegram_account_linking.sql",
  "037_telegram_task_notifications.sql",
  "038_marathons_leaderboard.sql",
  "040_daily_marathon.sql",
  "042_telegram_notification_preferences.sql",
  "044_notification_channels_and_invites.sql",
  "045_cabinet_scope_full.sql",
  "046_riddle_bank.sql",
  "047_marathon_message_timeline.sql",
  "050_marathon_cron_heartbeat.sql",
].map((version) => ({ version }));

function harness(linked: Array<{ user_id: number; telegram_user_id: string }>) {
  const executed: string[] = [];
  let rolledBack = 0;
  let committed = 0;
  const connection: SqlConnection = {
    beginTransaction: async () => undefined,
    commit: async () => {
      committed += 1;
    },
    rollback: async () => {
      rolledBack += 1;
    },
    release: () => undefined,
    query: async <T>(sql: string) => {
      if (sql.includes("schema_migrations")) return recordedVersions as T[];
      if (sql.includes("FROM marathon_bot_links")) {
        return [{
          id: 5,
          marathon_id: 3,
          user_id: 7,
          expires_at: new Date(Date.now() + 60_000),
          consumed_at: null,
        }] as T[];
      }
      if (sql.includes("FROM app_users")) return [{ id: 7, is_banned: 0 }] as T[];
      if (sql.includes("notify_paused")) return [{ notify_paused: 1 }] as T[];
      if (sql.includes("FROM user_telegram_accounts")) return linked as T[];
      return [] as T[];
    },
    execute: async (sql) => {
      executed.push(sql);
      return { insertId: 1, affectedRows: 1 };
    },
  };
  return {
    connection,
    executed,
    counts: () => ({ rolledBack, committed }),
  };
}

test.beforeEach(() => {
  resetSchemaGuardForTests();
});

test("consumeMarathonStart rolls back and keeps the code when Telegram belongs to someone else", async () => {
  const db = harness([{ user_id: 8, telegram_user_id: "555" }]);
  const result = await consumeMarathonStart(
    "mth_foreign",
    { userId: "555", chatId: "555" },
    async () => db.connection,
  );
  assert.deepEqual(result, { ok: false, code: "telegram_taken" });
  assert.equal(db.counts().rolledBack, 1);
  assert.equal(db.counts().committed, 0);
  assert.equal(
    db.executed.some((sql) => sql.includes("consumed_at")),
    false,
  );
});

test("consumeMarathonStart updates the same Telegram account and consumes the code", async () => {
  const db = harness([{ user_id: 7, telegram_user_id: "555" }]);
  const result = await consumeMarathonStart(
    "mth_same",
    { userId: "555", chatId: "777" },
    async () => db.connection,
  );
  assert.deepEqual(result, { ok: true });
  assert.equal(db.counts().committed, 1);
  assert.equal(
    db.executed.some((sql) => sql.includes("SET consumed_at")),
    true,
  );
});
