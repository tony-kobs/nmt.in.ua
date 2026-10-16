import assert from "node:assert/strict";
import test from "node:test";
import { isDayPassed, scorePercent } from "./score";
import { gateDay, submitOpenedDay } from "./submit";

const schedule = {
  startDate: "2026-01-10",
  unlockHour: "09:00",
  daysCount: 5,
  dayNumber: 2,
};

test("score uses the threshold only as a passed mark", () => {
  assert.equal(scorePercent(3, 4), 75);
  assert.equal(scorePercent(0, 0), 0);
  assert.equal(isDayPassed(59, 60), false);
  assert.equal(isDayPassed(60, 60), true);
  assert.equal(isDayPassed(100, 60, 0), false);
  assert.equal(isDayPassed(0, 0, 0), false);
});

test("submit refuses a locked day and does not grade or persist", async () => {
  let graded = 0;
  let persisted = 0;
  const result = await submitOpenedDay(
    {
      ...schedule,
      materialsViewed: true,
      passThreshold: 60,
      progress: [],
      clientNow: Date.parse("2026-01-20T00:00:00.000Z"),
    },
    {
      now: () => new Date("2026-01-10T07:00:00.000Z"),
      grade: () => {
        graded += 1;
        return { correct: 4, total: 4 };
      },
      persist: async () => {
        persisted += 1;
      },
    },
  );
  assert.deepEqual(result, { ok: false, code: "locked" });
  assert.equal(graded, 0);
  assert.equal(persisted, 0);
  assert.equal(
    gateDay({
      ...schedule,
      now: new Date("2026-01-10T07:00:00.000Z"),
      materialsViewed: true,
    }).ok,
    false,
  );
});

test("an opened day can be failed without blocking, and a pass updates the streak", async () => {
  const now = new Date("2026-01-11T08:00:00.000Z");
  const failed = await submitOpenedDay(
    {
      ...schedule,
      materialsViewed: true,
      passThreshold: 60,
      progress: [{ dayNumber: 1, passed: true, completedAt: Date.parse("2026-01-10T08:00:00.000Z") }],
    },
    {
      now: () => now,
      grade: () => ({ correct: 1, total: 4 }),
      persist: async () => undefined,
    },
  );
  assert.equal(failed.ok, true);
  if (failed.ok) {
    assert.equal(failed.score, 25);
    assert.equal(failed.passed, false);
    assert.equal(failed.streak, 0);
  }

  const passed = await submitOpenedDay(
    {
      ...schedule,
      materialsViewed: true,
      passThreshold: 60,
      progress: [{ dayNumber: 1, passed: true, completedAt: Date.parse("2026-01-10T08:00:00.000Z") }],
    },
    {
      now: () => now,
      grade: () => ({ correct: 3, total: 4 }),
      persist: async () => undefined,
    },
  );
  assert.equal(passed.ok, true);
  if (passed.ok) {
    assert.equal(passed.score, 75);
    assert.equal(passed.passed, true);
    assert.equal(passed.streak, 2);
  }
});

test("tasks stay closed until materials were marked viewed", async () => {
  let persisted = 0;
  const result = await submitOpenedDay(
    {
      ...schedule,
      dayNumber: 1,
      materialsViewed: false,
      passThreshold: 60,
      progress: [],
    },
    {
      now: () => new Date("2026-01-10T08:00:00.000Z"),
      grade: () => ({ correct: 1, total: 1 }),
      persist: async () => {
        persisted += 1;
      },
    },
  );
  assert.deepEqual(result, { ok: false, code: "materials_required" });
  assert.equal(persisted, 0);
});
