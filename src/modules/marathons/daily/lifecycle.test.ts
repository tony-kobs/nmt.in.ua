import assert from "node:assert/strict";
import test from "node:test";
import { dailyMarathonClosesAt, shouldFinishDailyMarathon } from "./lifecycle";

const schedule = {
  startDate: "2026-10-09",
  unlockHour: "09:00",
  daysCount: 5,
};

test("an active course finishes when the day after the last one unlocks", () => {
  const closesAt = dailyMarathonClosesAt(schedule);
  assert.ok(closesAt);
  assert.equal(shouldFinishDailyMarathon(new Date(closesAt.getTime() - 1), schedule), false);
  assert.equal(shouldFinishDailyMarathon(closesAt, schedule), true);
  assert.equal(
    shouldFinishDailyMarathon(new Date("2026-10-13T07:00:00.000Z"), schedule),
    false,
  );
  assert.equal(
    shouldFinishDailyMarathon(new Date("2026-10-16T08:00:00.000Z"), schedule),
    true,
  );
});

test("missing day rows do not keep a course active past the scheduled close", () => {
  const empty = { ...schedule, daysCount: 10 };
  assert.equal(
    shouldFinishDailyMarathon(new Date("2026-10-16T08:00:00.000Z"), empty),
    false,
  );
  const startedEarlier = { startDate: "2026-10-04", unlockHour: "09:00", daysCount: 10 };
  assert.equal(dailyMarathonClosesAt({ startDate: "", unlockHour: "09:00", daysCount: 5 }), null);
  assert.equal(shouldFinishDailyMarathon(new Date("2026-10-16T08:00:00.000Z"), {
    startDate: "2026-10-04",
    unlockHour: "09:00",
    daysCount: 0,
  }), false);
  assert.equal(
    shouldFinishDailyMarathon(new Date("2026-10-16T08:00:00.000Z"), startedEarlier),
    true,
  );
});
