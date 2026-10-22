import assert from "node:assert/strict";
import test from "node:test";
import { dayUnlockAt, reminderAt } from "./calendar";
import {
  cardStatsSql,
  foldCardStats,
  loadMarathonCardStats,
  type CardCourse,
  type CardStatRow,
} from "./cardStats";

const OPEN = dayUnlockAt({ startDate: "2026-01-10", unlockHour: "09:00", dayNumber: 1 });
const REMIND = reminderAt({ startDate: "2026-01-10", dayNumber: 1, reminderHour: "19:00" });

function course(patch: Partial<CardCourse> = {}): CardCourse {
  return {
    id: 7,
    status: "active",
    startDate: "2026-01-10",
    unlockHour: "09:00",
    reminderHour: "19:00",
    nudgeFrom: 10,
    nudgeUntil: 21,
    daysCount: 5,
    ...patch,
  };
}

function row(patch: Partial<CardStatRow> = {}): CardStatRow {
  return {
    marathonId: 7,
    dayNumber: 1,
    registered: 4,
    telegram: 2,
    finished: 1,
    submitted: 0,
    scoreSum: 0,
    scoreCount: 0,
    taskCount: 1,
    nextOutbox: null,
    nextJob: null,
    ...patch,
  };
}

test("fold does not multiply participant totals by the number of day rows", () => {
  const stats = foldCardStats({
    courses: [course()],
    now: new Date(OPEN.getTime() + 60 * 60 * 1000),
    rows: [
      row({ dayNumber: 1, registered: 4, telegram: 2, finished: 1, submitted: 2, scoreSum: 80, scoreCount: 1 }),
      row({ dayNumber: 2, registered: 4, telegram: 2, finished: 1, submitted: 1, scoreSum: 60, scoreCount: 1 }),
    ],
  });
  const card = stats.get(7);
  assert.equal(card?.registered, 4);
  assert.equal(card?.telegram, 2);
  assert.equal(card?.finished, 1);
  assert.equal(card?.avgScore, 70);
  assert.equal(card?.completionPercent, 15);
  assert.equal(card?.focus, "today");
  assert.equal(card?.focusDay, 1);
  assert.equal(card?.focusSubmitted, 2);
  assert.deepEqual(card?.progress, { kind: "day", current: 1, total: 5 });
  assert.equal(card?.nextSendAt?.toISOString(), REMIND.toISOString());
});

test("a cancelled day opening moves the next send to the reminder", () => {
  const stats = foldCardStats({
    courses: [course({ daysCount: 1 })],
    now: new Date(OPEN.getTime() - 60 * 60 * 1000),
    overrides: [
      { marathonId: 7, dayNumber: 1, kind: "day_open", channel: "email", cancelled: true, sendAt: null, body: null },
      { marathonId: 7, dayNumber: 1, kind: "day_open", channel: "telegram", cancelled: true, sendAt: null, body: null },
    ],
    rows: [row({ dayNumber: 1, taskCount: 1 })],
  });
  assert.equal(stats.get(7)?.nextSendAt?.toISOString(), REMIND.toISOString());
});

test("a postponed opening is the next send while it is still ahead", () => {
  const postponed = new Date(OPEN.getTime() + 5 * 60 * 60 * 1000);
  const stats = foldCardStats({
    courses: [course()],
    now: new Date(OPEN.getTime() + 60 * 60 * 1000),
    overrides: [
      { marathonId: 7, dayNumber: 1, kind: "day_open", channel: "email", cancelled: false, sendAt: postponed, body: null },
      { marathonId: 7, dayNumber: 1, kind: "day_open", channel: "telegram", cancelled: false, sendAt: postponed, body: null },
    ],
    rows: [row({ dayNumber: 1, taskCount: 1 }), row({ dayNumber: 2, taskCount: 1 })],
  });
  assert.ok(postponed.getTime() < REMIND.getTime());
  assert.equal(stats.get(7)?.nextSendAt?.toISOString(), postponed.toISOString());
});

test("a draft shows the start date and still plans the first opening", () => {
  const stats = foldCardStats({
    courses: [course({ status: "draft" })],
    now: new Date(OPEN.getTime() - 20 * 60 * 60 * 1000),
    rows: [row({ dayNumber: 1, taskCount: 1, registered: 0, telegram: 0, finished: 0 })],
  });
  const card = stats.get(7);
  assert.deepEqual(card?.progress, { kind: "start", date: "2026-01-10" });
  assert.equal(card?.nextSendAt?.toISOString(), OPEN.toISOString());
  assert.equal(card?.avgScore, null);
  assert.equal(card?.completionPercent, null);
});

test("an archived card keeps final numbers and has no next send", () => {
  const pending = new Date(OPEN.getTime() + 60 * 60 * 1000);
  const stats = foldCardStats({
    courses: [course({ status: "archived", daysCount: 2 })],
    now: new Date("2026-02-01T12:00:00.000Z"),
    rows: [
      row({
        dayNumber: 1,
        registered: 4,
        submitted: 4,
        scoreSum: 200,
        scoreCount: 4,
        nextOutbox: pending,
      }),
      row({ dayNumber: 2, registered: 4, submitted: 3, scoreSum: 90, scoreCount: 3, finished: 3 }),
    ],
  });
  const card = stats.get(7);
  assert.equal(card?.focus, "last");
  assert.equal(card?.focusDay, 2);
  assert.equal(card?.focusSubmitted, 3);
  assert.equal(card?.finished, 3);
  assert.deepEqual(card?.progress, { kind: "day", current: 2, total: 2 });
  assert.equal(card?.nextSendAt, null);
  assert.equal(card?.registered, 4);
});

test("days without tasks do not schedule a send", () => {
  const day2 = dayUnlockAt({ startDate: "2026-01-10", unlockHour: "09:00", dayNumber: 2 });
  const stats = foldCardStats({
    courses: [course({ daysCount: 2 })],
    now: new Date(OPEN.getTime() - 60 * 60 * 1000),
    rows: [
      row({ dayNumber: 1, taskCount: 0 }),
      row({ dayNumber: 2, taskCount: 2 }),
    ],
  });
  assert.equal(stats.get(7)?.nextSendAt?.toISOString(), day2.toISOString());
});

test("loadMarathonCardStats reads every card in one query", async () => {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const stats = await loadMarathonCardStats(
    [course({ id: 7 }), course({ id: 8, status: "draft" })],
    {
      now: new Date(OPEN.getTime() + 60 * 60 * 1000),
      overrides: [],
      query: async (sql, params) => {
        calls.push({ sql, params });
        return [
          {
            marathon_id: 7,
            day_number: 1,
            registered: 3,
            telegram_count: 1,
            finished: 0,
            submitted: 2,
            score_sum: 80,
            score_count: 1,
            task_count: 1,
            next_outbox: null,
            next_job: null,
          },
          {
            marathon_id: 7,
            day_number: 2,
            registered: 3,
            telegram_count: 1,
            finished: 0,
            submitted: 0,
            score_sum: 0,
            score_count: 0,
            task_count: 1,
            next_outbox: null,
            next_job: null,
          },
        ];
      },
    },
  );
  assert.equal(calls.length, 1);
  assert.match(calls[0]!.sql, /GROUP BY p\.marathon_id/);
  assert.match(calls[0]!.sql, /user_telegram_accounts/);
  assert.match(calls[0]!.sql, /WHERE m\.id IN \(\?, \?\)/);
  assert.deepEqual(calls[0]!.params, [7, 8]);
  assert.equal(cardStatsSql([7, 8]).includes("user_telegram_accounts"), true);
  assert.equal(stats.get(7)?.registered, 3);
  assert.equal(stats.get(8)?.registered, 0);
  assert.equal(stats.get(8)?.progress.kind, "start");
});

test("a missing telegram table retries without that join", async () => {
  const sqls: string[] = [];
  await loadMarathonCardStats([course()], {
    now: OPEN,
    overrides: [],
    query: async (sql) => {
      sqls.push(sql);
      if (sqls.length === 1) {
        const error = new Error("missing") as Error & { errno: number };
        error.errno = 1146;
        throw error;
      }
      return [];
    },
  });
  assert.equal(sqls.length, 2);
  assert.match(sqls[0]!, /user_telegram_accounts/);
  assert.equal(sqls[1]!.includes("user_telegram_accounts"), false);
});

test("an empty shelf does not query", async () => {
  let called = false;
  const stats = await loadMarathonCardStats([], {
    query: async () => {
      called = true;
      return [];
    },
  });
  assert.equal(called, false);
  assert.equal(stats.size, 0);
});

test("a failed read still returns a zero card", async () => {
  const write = console.error;
  console.error = () => {};
  try {
    const stats = await loadMarathonCardStats([course()], {
      now: OPEN,
      overrides: [],
      query: async () => {
        throw new Error("down");
      },
    });
    assert.equal(stats.get(7)?.registered, 0);
    assert.equal(stats.get(7)?.avgScore, null);
  } finally {
    console.error = write;
  }
});
