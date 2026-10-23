import assert from "node:assert/strict";
import test from "node:test";
import { rankParticipants } from "./daily/leaderboard";
import {
  ALL_MARATHONS_SLUG,
  boardShowsSpeed,
  buildDailyBoard,
  pickMarathonSlug,
  sortBoardChoices,
  type DailyBoardPerson,
  type DailyDayResult,
} from "./boardStats";

const people: DailyBoardPerson[] = [
  { userId: 1, displayName: "Анна Коваль", login: "anna", joinedAt: 1_000, streak: 2 },
  { userId: 2, displayName: "Богдан", login: "bohdan", joinedAt: 2_000, streak: 0 },
  { userId: 3, displayName: "Віра", login: "vira", joinedAt: 500, streak: 1 },
];

function day(patch: Partial<DailyDayResult> & Pick<DailyDayResult, "userId" | "dayId">): DailyDayResult {
  return {
    score: 80,
    correctCount: 4,
    completedAt: 10_000,
    ...patch,
  };
}

test("daily board ranks by total correct answers, the same way as Telegram /top", () => {
  const days = [
    day({ userId: 1, dayId: 1, correctCount: 3, score: 75, completedAt: 20_000 }),
    day({ userId: 1, dayId: 2, correctCount: 2, score: 50, completedAt: 30_000 }),
    day({ userId: 2, dayId: 1, correctCount: 8, score: 100, completedAt: 50_000 }),
    day({ userId: 3, dayId: 1, correctCount: 5, score: 60, completedAt: 15_000 }),
  ];
  const board = buildDailyBoard(people, days);
  const expected = rankParticipants([
    { userId: 1, displayName: "Анна Коваль", points: 5, lastCompletedAt: 30_000, totalTimeSec: null, streak: 2, joinedAt: 1_000 },
    { userId: 2, displayName: "Богдан", points: 8, lastCompletedAt: 50_000, totalTimeSec: null, streak: 0, joinedAt: 2_000 },
    { userId: 3, displayName: "Віра", points: 5, lastCompletedAt: 15_000, totalTimeSec: null, streak: 1, joinedAt: 500 },
  ]).map((row) => row.userId);
  assert.deepEqual(board.map((row) => row.userId), expected);
  assert.deepEqual(board.map((row) => row.rank), [1, 2, 3]);
  const anna = board.find((row) => row.userId === 1);
  assert.equal(anna?.daysDone, 2);
  assert.equal(anna?.points, 5);
  assert.equal(anna?.avgPercent, 62.5);
  assert.equal(board.find((row) => row.userId === 2)?.points, 8);
});

test("an equal score with unknown time still puts the earlier last day first", () => {
  const days = [
    day({ userId: 1, dayId: 1, correctCount: 4, completedAt: 40_000 }),
    day({ userId: 2, dayId: 1, correctCount: 4, completedAt: 10_000 }),
  ];
  const board = buildDailyBoard(people, days);
  assert.deepEqual(board.map((row) => row.userId), [2, 1, 3]);
  const idle = board.find((row) => row.userId === 3);
  assert.equal(idle?.daysDone, 0);
  assert.equal(idle?.points, 0);
  assert.equal(idle?.avgPercent, null);
  assert.equal(idle?.avgSecPerTask, null);
});

test("average time per task uses only days that stored a duration", () => {
  const days = [
    day({ userId: 1, dayId: 1, timeSec: 40, taskCount: 4, completedAt: 10_000 }),
    day({ userId: 1, dayId: 2, timeSec: null, taskCount: 4, completedAt: 11_000 }),
    day({ userId: 1, dayId: 3, timeSec: 20, taskCount: 2, completedAt: 12_000 }),
  ];
  const [row] = buildDailyBoard([people[0]], days);
  assert.equal(row.daysDone, 3);
  assert.equal(row.totalTimeSec, null);
  assert.equal(row.avgSecPerTask, 10);
  assert.equal(boardShowsSpeed("daily", [row]), true);
  assert.equal(boardShowsSpeed("daily", [{ avgSecPerTask: null }]), false);
  assert.equal(boardShowsSpeed("sessions", [{ avgSecPerTask: null }]), true);
});

test("a repeated day is counted once", () => {
  const days = [
    day({ userId: 1, dayId: 4, correctCount: 3 }),
    day({ userId: 1, dayId: 4, correctCount: 9 }),
  ];
  const [row] = buildDailyBoard([people[0]], days);
  assert.equal(row.daysDone, 1);
  assert.equal(row.points, 3);
});

test("days from two marathons add up even when the day id is the same", () => {
  const days = [
    day({ userId: 1, dayId: 1, marathonId: 4, correctCount: 4, score: 80, completedAt: 10_000 }),
    day({ userId: 1, dayId: 1, marathonId: 9, correctCount: 2, score: 50, completedAt: 30_000 }),
  ];
  const board = buildDailyBoard(
    [
      { ...people[0], joinedAt: 5_000, displayName: "Пізніший запис" },
      people[0],
    ],
    days,
  );
  assert.equal(board.length, 1);
  assert.equal(board[0]?.daysDone, 2);
  assert.equal(board[0]?.points, 6);
  assert.equal(board[0]?.avgPercent, 65);
  assert.equal(board[0]?.displayName, "Анна Коваль");
  const tied = buildDailyBoard(
    [
      { ...people[0], joinedAt: 1_000 },
      { ...people[1], joinedAt: 4_000 },
    ],
    [
      day({ userId: 1, dayId: 1, marathonId: 4, correctCount: 3, completedAt: 20_000 }),
      day({ userId: 2, dayId: 1, marathonId: 9, correctCount: 3, completedAt: 20_000 }),
    ],
  );
  assert.deepEqual(tied.map((row) => row.userId), [1, 2]);
});

test("equal points put the shorter known total first and leave an unknown time behind", () => {
  const board = buildDailyBoard(people, [
    day({ userId: 1, dayId: 1, correctCount: 4, timeSec: 900, completedAt: 10_000 }),
    day({ userId: 2, dayId: 1, correctCount: 4, timeSec: 30, completedAt: 90_000 }),
    day({ userId: 3, dayId: 1, correctCount: 4, timeSec: null, completedAt: 1_000 }),
  ]);
  assert.deepEqual(board.map((row) => row.userId), [2, 1, 3]);
  assert.equal(board.find((row) => row.userId === 2)?.totalTimeSec, 30);
  assert.equal(board.find((row) => row.userId === 3)?.totalTimeSec, null);
});

test("the selector prefers the requested marathon, otherwise an active daily one", () => {
  const options = sortBoardChoices([
    { slug: "pilot", kind: "sessions" as const, status: "active", startsAt: 9, id: 1 },
    { slug: "old-course", kind: "daily" as const, status: "finished", startsAt: 8, id: 2 },
    { slug: "math-5", kind: "daily" as const, status: "active", startsAt: 3, id: 3 },
    { slug: "later", kind: "daily" as const, status: "active", startsAt: 7, id: 4 },
  ]);
  assert.deepEqual(options.map((item) => item.slug), ["later", "math-5", "old-course", "pilot"]);
  assert.equal(pickMarathonSlug(options, undefined), "later");
  assert.equal(pickMarathonSlug(options, "pilot"), "pilot");
  assert.equal(pickMarathonSlug(options, "missing"), "later");
  assert.equal(pickMarathonSlug(options, ALL_MARATHONS_SLUG), ALL_MARATHONS_SLUG);
  assert.equal(pickMarathonSlug([], "math-5"), null);
  assert.equal(pickMarathonSlug([], ALL_MARATHONS_SLUG), null);

  const finished = sortBoardChoices([
    { slug: "older", kind: "daily" as const, status: "finished", startsAt: 1, id: 1 },
    { slug: "newer", kind: "daily" as const, status: "finished", startsAt: 5, id: 2 },
  ]);
  assert.equal(pickMarathonSlug(finished, undefined), "newer");

  const sessionsOnly = [
    { slug: "pilot", kind: "sessions" as const, status: "active" },
  ];
  assert.equal(pickMarathonSlug(sessionsOnly, ALL_MARATHONS_SLUG), "pilot");
});
