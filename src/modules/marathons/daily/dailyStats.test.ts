import assert from "node:assert/strict";
import test from "node:test";

import { buildDailyFunnel } from "./dailyStats";

test("dropoff is the fall from the previous completed count, and day 1 starts from registered", () => {
  const funnel = buildDailyFunnel({
    slug: "math-5",
    daysCount: 3,
    registered: 10,
    telegramLinked: 7,
    finished: 4,
    ticketsOpen: 2,
    deliveryErrors24h: 1,
    days: [
      { day: 1, opened: 9, completed: 8, scoreSum: 640, scoreCount: 8, times: [600, 900] },
      { day: 2, opened: 6, completed: 5, scoreSum: 400, scoreCount: 5 },
      { day: 3, opened: 6, completed: 6, scoreSum: 0, scoreCount: 0 },
    ],
  });
  assert.equal(funnel.slug, "math-5");
  assert.equal(funnel.registered, 10);
  assert.equal(funnel.telegramLinked, 7);
  assert.equal(funnel.finished, 4);
  assert.equal(funnel.ticketsOpen, 2);
  assert.equal(funnel.deliveryErrors24h, 1);
  assert.deepEqual(funnel.days, [
    { day: 1, opened: 9, completed: 8, avgScore: 80, avgTimeSec: 750, medianTimeSec: 750, dropoff: 2 },
    { day: 2, opened: 6, completed: 5, avgScore: 80, avgTimeSec: null, medianTimeSec: null, dropoff: 3 },
    { day: 3, opened: 6, completed: 6, avgScore: null, avgTimeSec: null, medianTimeSec: null, dropoff: 0 },
  ]);
});

test("missing days stay in the funnel and another course's day does not leak in", () => {
  const funnel = buildDailyFunnel({
    slug: "vesna",
    daysCount: 2,
    registered: 0,
    telegramLinked: 0,
    finished: 0,
    ticketsOpen: 0,
    deliveryErrors24h: 0,
    days: [{ day: 9, opened: 4, completed: 4, scoreSum: 100, scoreCount: 1 }],
  });
  assert.deepEqual(funnel.days, [
    { day: 1, opened: 0, completed: 0, avgScore: null, avgTimeSec: null, medianTimeSec: null, dropoff: 0 },
    { day: 2, opened: 0, completed: 0, avgScore: null, avgTimeSec: null, medianTimeSec: null, dropoff: 0 },
  ]);
});
