import assert from "node:assert/strict";
import test from "node:test";
import type { SqlConnection } from "@/lib/db/mysql";
import { getMarathonLeaderboard } from "./getMarathonLeaderboard";

test("the public board defaults to a daily marathon and reads day results, not practice sessions", async () => {
  const now = Math.floor(Date.now() / 1000);
  const marathons = [
    {
      id: 1,
      slug: "pilot",
      title: "Пілотний марафон",
      description: "Тимчасовий марафон",
      status: "active",
      starts_at: now - 10,
      ends_at: now + 10_000,
      min_tasks_per_session: 5,
      kind: "leaderboard",
    },
    {
      id: 9,
      slug: "math-5",
      title: "П'ять днів",
      description: "Дроби",
      status: "active",
      starts_at: now - 5,
      ends_at: now + 10_000,
      min_tasks_per_session: 5,
      kind: "daily",
    },
  ];
  const people = [
    { user_id: 7, display_name: "Валентин Бурий", login: "grotesk", joined_at: now - 4 },
    { user_id: 8, display_name: "Анна", login: "anna", joined_at: now - 3 },
  ];
  const days = [
    { user_id: 7, day_id: 1, score: 50, correct_count: 2, completed_at: now - 2 },
    { user_id: 7, day_id: 2, score: 100, correct_count: 4, completed_at: now - 1 },
    { user_id: 8, day_id: 1, score: 75, correct_count: 3, completed_at: now - 1 },
  ];
  let sessionReads = 0;
  const connection: SqlConnection = {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    query: async <T>(sql: string, params: unknown[] = []) => {
      if (sql.includes("FROM marathons") && sql.includes("kind = 'daily'")) return marathons as T[];
      if (sql.includes("FROM marathon_participants")) return people as T[];
      if (sql.includes("FROM marathon_day_progress") && sql.includes("pr.score")) {
        return (Number(params[0]) === 9 ? days : []) as T[];
      }
      if (sql.includes("FROM task_sessions")) {
        sessionReads += 1;
        return [] as T[];
      }
      return [] as T[];
    },
    execute: async () => ({ insertId: 0, affectedRows: 1 }),
  };
  const getConnection = async () => connection;
  const board = await getMarathonLeaderboard(7, {}, getConnection);
  assert.ok(board);
  assert.equal(board.marathon.slug, "math-5");
  assert.equal(board.marathon.kind, "daily");
  assert.deepEqual(board.options.map((item) => item.slug), ["math-5", "pilot"]);
  assert.deepEqual(board.rows.map((row) => row.userId), [7, 8]);
  assert.equal(board.rows[0]?.points, 6);
  assert.equal(board.rows[0]?.daysDone, 2);
  assert.equal(board.rows[0]?.avgPercent, 75);
  assert.equal(board.rows[0]?.isCurrentUser, true);
  assert.equal(sessionReads, 0);

  const pilot = await getMarathonLeaderboard(7, { marathonSlug: "pilot" }, getConnection);
  assert.equal(pilot?.marathon.kind, "sessions");
  assert.equal(sessionReads, 1);
  assert.equal(pilot?.rows[0]?.sessionsCount, 0);
  assert.equal(pilot?.rows[0]?.avgPercent, null);
});
