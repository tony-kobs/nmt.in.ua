import assert from "node:assert/strict";
import test from "node:test";

import type { SqlConnection } from "@/lib/db/mysql";
import { resetSchemaGuardForTests } from "@/lib/db/schemaGuard";
import { loadTimelineSnapshot } from "./messageOverrides";

const versions = [
  "038_marathons_leaderboard.sql",
  "040_daily_marathon.sql",
  "044_notification_channels_and_invites.sql",
  "045_cabinet_scope_full.sql",
  "046_riddle_bank.sql",
  "047_marathon_message_timeline.sql",
  "050_marathon_cron_heartbeat.sql",
  "051_support_tickets.sql",
  "052_marathon_survey.sql",
  "053_marathon_scheduler_runs.sql",
  "054_team_chat_broadcast.sql",
  "055_marathon_day_time.sql",
  "056_marathon_images.sql",
].map((version) => ({ version }));

test("the queue join compares chat ids as numbers and a bad payload still loads", async () => {
  resetSchemaGuardForTests();
  const sqls: string[] = [];
  const connection: SqlConnection = {
    beginTransaction: async () => undefined,
    commit: async () => undefined,
    rollback: async () => undefined,
    release: () => undefined,
    query: async <T>(sql: string) => {
      sqls.push(sql);
      if (sql.includes("schema_migrations")) return versions as T[];
      if (sql.includes("FROM marathon_telegram_outbox")) {
        return [{
          id: 4,
          status: "pending",
          not_before: null,
          created_at: new Date("2026-10-23T10:00:00Z"),
          payload: null,
          error_text: null,
          hold_reason: null,
          who: "Іра",
        }] as T[];
      }
      return [] as T[];
    },
    execute: async () => ({ insertId: 0, affectedRows: 0 }),
  };
  const snapshot = await loadTimelineSnapshot(3, async () => connection);
  const outboxSql = sqls.find((sql) => sql.includes("FROM marathon_telegram_outbox")) ?? "";
  assert.match(outboxSql, /uta\.telegram_chat_id = CAST\(o\.chat_id AS UNSIGNED\)/);
  assert.equal(outboxSql.includes("CAST(uta.telegram_chat_id AS CHAR)"), false);
  assert.equal(snapshot.outbox.length, 1);
  assert.equal(snapshot.outbox[0]?.who, "Іра");
  assert.equal(snapshot.outbox[0]?.text, "");
  assert.equal(snapshot.outbox[0]?.status, "pending");
});
