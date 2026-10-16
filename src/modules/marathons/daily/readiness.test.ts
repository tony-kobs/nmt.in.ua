import assert from "node:assert/strict";
import test from "node:test";
import { activationBlockers, marathonIsReady } from "./readiness";

test("activation needs every scheduled day and at least one task on each", () => {
  const empty = activationBlockers({ daysCount: 3, days: [] });
  assert.deepEqual(empty, { daysCount: 3, missingDays: [1, 2, 3], emptyDays: [] });
  assert.equal(marathonIsReady(empty), false);

  const gap = activationBlockers({
    daysCount: 3,
    days: [
      { dayNumber: 1, taskCount: 2 },
      { dayNumber: 3, taskCount: 0 },
    ],
  });
  assert.deepEqual(gap, { daysCount: 3, missingDays: [2], emptyDays: [3] });

  const ready = activationBlockers({
    daysCount: 2,
    days: [
      { dayNumber: 1, taskCount: 1 },
      { dayNumber: 2, taskCount: 4 },
      { dayNumber: 9, taskCount: 0 },
    ],
  });
  assert.deepEqual(ready, { daysCount: 2, missingDays: [], emptyDays: [] });
  assert.equal(marathonIsReady(ready), true);
});

test("a day with zero tasks is not ready even when the row exists", () => {
  const blockers = activationBlockers({
    daysCount: 1,
    days: [{ dayNumber: 1, taskCount: 0 }],
  });
  assert.deepEqual(blockers, { daysCount: 1, missingDays: [], emptyDays: [1] });
  assert.equal(marathonIsReady(blockers), false);

  const unscheduled = activationBlockers({ daysCount: 0, days: [] });
  assert.equal(marathonIsReady(unscheduled), false);
});
