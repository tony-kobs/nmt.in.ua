import assert from "node:assert/strict";
import test from "node:test";

import type { SqlConnection } from "@/lib/db/mysql";
import { resetSchemaGuardForTests } from "@/lib/db/schemaGuard";
import { completeParticipantDay, type DailyMarathon, type MarathonDay } from "./store";

const marathon: DailyMarathon = {
  id: 3,
  slug: "vesna",
  title: "Весна",
  description: "",
  subject: "math",
  startDate: "2020-01-01",
  unlockHour: "00:00",
  reminderHour: "18:00",
  nudgeFrom: 1,
  nudgeUntil: 2,
  daysCount: 3,
  passThreshold: 60,
  finalCtaText: "",
  finalCtaUrl: "",
  introVideoUrl: "",
  inviteAudience: "none",
  landingRiddleCount: 3,
  status: "active",
};

const day: MarathonDay = {
  id: 9,
  dayNumber: 1,
  topic: "Дроби",
  introText: null,
};

const versions = [
  { version: "038_marathons_leaderboard.sql" },
  { version: "040_daily_marathon.sql" },
  { version: "044_notification_channels_and_invites.sql" },
  { version: "045_cabinet_scope_full.sql" },
  { version: "046_riddle_bank.sql" },
];

function harness(options?: { failInsert?: boolean }) {
  const queries: string[] = [];
  const executed: string[] = [];
  let completed = false;
  let began = 0;
  let committed = 0;
  let rolledBack = 0;
  const connection: SqlConnection = {
    beginTransaction: async () => {
      began += 1;
    },
    commit: async () => {
      committed += 1;
    },
    rollback: async () => {
      rolledBack += 1;
    },
    release: () => undefined,
    query: async <T>(sql: string) => {
      queries.push(sql);
      if (sql.includes("schema_migrations")) return versions as T[];
      if (sql.includes("FROM marathon_participants") && sql.includes("FOR UPDATE") && !sql.includes("marathon_day_progress")) {
        return [{ user_id: 7 }] as T[];
      }
      if (sql.includes("marathon_day_progress pr") && sql.includes("FOR UPDATE")) {
        if (!completed) return [] as T[];
        return [{
          completed_at: new Date("2026-10-16T10:00:00.000Z"),
          score: 0,
          passed: 0,
          streak: 1,
        }] as T[];
      }
      if (sql.includes("COALESCE(SUM")) {
        return [{
          user_id: 7,
          display_name: "Аня",
          streak: 1,
          joined_at: new Date("2026-01-01T00:00:00.000Z"),
          points: 0,
          last_completed: new Date("2026-10-16T10:00:00.000Z"),
        }] as T[];
      }
      return [] as T[];
    },
    execute: async (sql) => {
      executed.push(sql);
      if (sql.includes("INSERT INTO marathon_day_progress")) {
        if (options?.failInsert) throw new Error("insert failed");
        completed = true;
      }
      return { insertId: 1, affectedRows: 1 };
    },
  };
  return {
    connection,
    queries,
    executed,
    counts: () => ({ began, committed, rolledBack }),
  };
}

const input = {
  marathon,
  userId: 7,
  day,
  answers: {} as Record<number, number>,
  materialsViewed: true,
  progress: [],
  now: new Date("2026-10-16T12:00:00.000Z"),
};

test.beforeEach(() => {
  resetSchemaGuardForTests();
});

test("completeParticipantDay locks the progress row and a second call is not fresh", async () => {
  const db = harness();
  const first = await completeParticipantDay(input, async () => db.connection);
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.fresh, true);
  assert.equal(db.counts().began, 1);
  assert.equal(db.counts().committed, 1);
  assert.equal(
    db.queries.filter((sql) => sql.includes("FOR UPDATE")).length,
    2,
  );
  assert.equal(
    db.executed.filter((sql) => sql.includes("INSERT INTO marathon_day_progress")).length,
    1,
  );

  const second = await completeParticipantDay(input, async () => db.connection);
  assert.equal(second.ok, true);
  if (!second.ok) return;
  assert.equal(second.fresh, false);
  assert.equal(
    db.executed.filter((sql) => sql.includes("INSERT INTO marathon_day_progress")).length,
    1,
  );
  assert.equal(db.counts().committed, 2);
});

test("completeParticipantDay rolls back when the write fails", async () => {
  const db = harness({ failInsert: true });
  await assert.rejects(
    () => completeParticipantDay(input, async () => db.connection),
    /insert failed/,
  );
  assert.equal(db.counts().rolledBack, 1);
  assert.equal(db.counts().committed, 0);
});
