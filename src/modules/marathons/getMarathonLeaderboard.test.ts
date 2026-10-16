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
  assert.deepEqual(board.options.map((item) => item.slug), ["all", "math-5", "pilot"]);
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

test("Загальні sums every daily marathon; one marathon stays on its own days", async () => {
  const now = Math.floor(Date.now() / 1000);
  const marathons = [
    {
      id: 1,
      slug: "pilot",
      title: "Пілот",
      description: null,
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
    {
      id: 4,
      slug: "math-4",
      title: "Минулий",
      description: null,
      status: "finished",
      starts_at: now - 50,
      ends_at: now - 10,
      min_tasks_per_session: 5,
      kind: "daily",
    },
  ];
  const people: Record<number, Array<{
    user_id: number;
    display_name: string;
    login: string;
    joined_at: number;
  }>> = {
    9: [
      { user_id: 7, display_name: "Валентин Бурий", login: "grotesk", joined_at: now - 4 },
      { user_id: 8, display_name: "Анна", login: "anna", joined_at: now - 3 },
    ],
    4: [
      { user_id: 7, display_name: "Валентин Бурий", login: "grotesk", joined_at: now - 40 },
      { user_id: 9, display_name: "Ігор", login: "ihor", joined_at: now - 30 },
      { user_id: 10, display_name: "Оля", login: "olya", joined_at: now - 20 },
    ],
    1: [
      { user_id: 11, display_name: "Поза курсом", login: "pilot-only", joined_at: now - 2 },
    ],
  };
  const days = [
    { marathon_id: 9, user_id: 7, day_id: 1, score: 50, correct_count: 2, completed_at: now - 2 },
    { marathon_id: 9, user_id: 7, day_id: 2, score: 100, correct_count: 4, completed_at: now - 1 },
    { marathon_id: 9, user_id: 8, day_id: 1, score: 75, correct_count: 3, completed_at: now - 1 },
    { marathon_id: 4, user_id: 7, day_id: 1, score: 80, correct_count: 4, completed_at: now - 20 },
    { marathon_id: 4, user_id: 9, day_id: 1, score: 40, correct_count: 1, completed_at: now - 10 },
    { marathon_id: 4, user_id: 10, day_id: 1, score: 60, correct_count: 3, completed_at: now },
  ];
  const connection: SqlConnection = {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    query: async <T>(sql: string, params: unknown[] = []) => {
      if (sql.includes("FROM marathons") && sql.includes("kind = 'daily'")) return marathons as T[];
      if (sql.includes("correct_count IS NULL")) return [] as T[];
      if (sql.includes("FROM marathon_participants")) {
        return params.flatMap((id) => people[Number(id)] ?? []) as T[];
      }
      if (sql.includes("FROM marathon_day_progress") && sql.includes("pr.score")) {
        const ids = new Set(params.map(Number));
        return days.filter((day) => ids.has(day.marathon_id)) as T[];
      }
      return [] as T[];
    },
    execute: async () => ({ insertId: 0, affectedRows: 1 }),
  };
  const getConnection = async () => connection;

  const current = await getMarathonLeaderboard(7, {}, getConnection);
  assert.equal(current?.marathon.slug, "math-5");
  assert.deepEqual(current?.options.map((item) => item.slug), ["all", "math-5", "math-4", "pilot"]);
  assert.deepEqual(current?.rows.map((row) => row.userId), [7, 8]);
  assert.equal(current?.rows[0]?.points, 6);
  assert.equal(current?.rows[0]?.daysDone, 2);
  assert.equal(current?.participantCount, 2);

  const all = await getMarathonLeaderboard(7, { marathonSlug: "all" }, getConnection);
  assert.equal(all?.marathon.slug, "all");
  assert.equal(all?.marathon.kind, "daily");
  assert.deepEqual(all?.rows.map((row) => row.userId), [7, 8, 10, 9]);
  assert.equal(all?.rows[0]?.points, 10);
  assert.equal(all?.rows[0]?.daysDone, 3);
  assert.equal(all?.rows[0]?.avgPercent, (50 + 100 + 80) / 3);
  assert.equal(all?.rows.find((row) => row.userId === 8)?.points, 3);
  assert.equal(all?.rows.find((row) => row.userId === 10)?.points, 3);
  assert.equal(all?.participantCount, 4);
  assert.equal(all?.isParticipant, true);
  assert.equal(all?.currentUserRank, 1);
  assert.equal(all?.rows.some((row) => row.userId === 11), false);

  const previous = await getMarathonLeaderboard(7, { marathonSlug: "math-4" }, getConnection);
  assert.deepEqual(previous?.rows.map((row) => row.userId), [7, 10, 9]);
  assert.equal(previous?.rows[0]?.points, 4);
  assert.equal(previous?.rows[0]?.daysDone, 1);

  const unknown = await getMarathonLeaderboard(7, { marathonSlug: "missing" }, getConnection);
  assert.equal(unknown?.marathon.slug, "math-5");
});
