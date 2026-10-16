import assert from "node:assert/strict";
import test from "node:test";
import {
  currentDayNumber,
  dayUnlockAt,
  evaluateDayAccess,
  isDayUnlocked,
  kyivDateIso,
  listDayAccess,
} from "./calendar";

const WINTER = {
  startDate: "2026-01-10",
  unlockHour: "09:00",
  daysCount: 5,
};

test("day 1 opens at 09:00 Europe/Kyiv in winter (UTC+2) and summer (UTC+3)", () => {
  assert.equal(
    dayUnlockAt({ ...WINTER, dayNumber: 1 }).toISOString(),
    "2026-01-10T07:00:00.000Z",
  );
  assert.equal(
    dayUnlockAt({
      startDate: "2026-07-10",
      unlockHour: "09:00",
      dayNumber: 1,
    }).toISOString(),
    "2026-07-10T06:00:00.000Z",
  );
});

test("calendar days follow Kyiv, including the spring-forward and fall-back gaps", () => {
  assert.equal(
    dayUnlockAt({
      startDate: "2026-03-28",
      unlockHour: "09:00",
      dayNumber: 1,
    }).toISOString(),
    "2026-03-28T07:00:00.000Z",
  );
  assert.equal(
    dayUnlockAt({
      startDate: "2026-03-28",
      unlockHour: "09:00",
      dayNumber: 2,
    }).toISOString(),
    "2026-03-29T06:00:00.000Z",
  );
  assert.equal(
    dayUnlockAt({
      startDate: "2026-10-24",
      unlockHour: "09:00",
      dayNumber: 2,
    }).toISOString(),
    "2026-10-25T07:00:00.000Z",
  );
});

test("a millisecond before unlock is locked; the unlock instant is open", () => {
  const before = new Date("2026-01-10T06:59:59.999Z");
  const at = new Date("2026-01-10T07:00:00.000Z");
  assert.equal(isDayUnlocked(before, { ...WINTER, dayNumber: 1 }), false);
  assert.equal(isDayUnlocked(at, { ...WINTER, dayNumber: 1 }), true);
  assert.equal(kyivDateIso(at), "2026-01-10");
});

test("day N opens for everyone at start + (N-1), independent of when someone joined", () => {
  const now = new Date("2026-01-12T06:00:00.000Z");
  const states = listDayAccess({ ...WINTER, now });
  assert.deepEqual(
    states.map((day) => day.open),
    [true, true, false, false, false],
  );
  const day3 = evaluateDayAccess({ ...WINTER, now, dayNumber: 3 });
  assert.equal(day3.open, false);
  if (!day3.open) assert.equal(day3.code, "locked");
  const later = evaluateDayAccess({
    ...WINTER,
    now: new Date("2026-01-12T07:00:00.000Z"),
    dayNumber: 3,
  });
  assert.equal(later.open, true);
});

test("future day numbers and a forged later clock are not accepted by the gate", () => {
  const serverNow = new Date("2026-01-10T07:00:00.000Z");
  const future = evaluateDayAccess({
    ...WINTER,
    now: serverNow,
    dayNumber: 2,
  });
  assert.equal(future.open, false);
  const outOfRange = evaluateDayAccess({
    ...WINTER,
    now: serverNow,
    dayNumber: 9,
  });
  assert.equal(outOfRange.open, false);
  if (!outOfRange.open) assert.equal(outOfRange.code, "invalid_day");
});

test("current day is today's unlock, day 1 before the start, and the last day after the end", () => {
  assert.equal(currentDayNumber({ ...WINTER, now: new Date("2026-01-09T12:00:00.000Z") }), 1);
  assert.equal(currentDayNumber({ ...WINTER, now: new Date("2026-01-10T07:00:00.000Z") }), 1);
  assert.equal(currentDayNumber({ ...WINTER, now: new Date("2026-01-11T07:00:00.000Z") }), 2);
  assert.equal(currentDayNumber({ ...WINTER, now: new Date("2026-01-20T07:00:00.000Z") }), 5);
  assert.equal(currentDayNumber({ ...WINTER, now: new Date("2026-01-10T07:00:00.000Z"), daysCount: 0 }), null);
});
