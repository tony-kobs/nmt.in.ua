import assert from "node:assert/strict";
import test from "node:test";
import {
  averageAndMedian,
  botDayTimeNote,
  durationSeconds,
  formatMarathonDuration,
  totalKnownSeconds,
} from "./durationText";

test("duration is the whole seconds from the first open until submit", () => {
  const start = Date.parse("2026-10-23T08:00:00.000Z");
  assert.equal(durationSeconds(start, start + 750_000), 750);
  assert.equal(durationSeconds(start, start + 400), 0);
  assert.equal(durationSeconds(null, start), null);
  assert.equal(durationSeconds(start, start - 1), null);
});

test("a missing day makes the total unknown", () => {
  assert.equal(totalKnownSeconds([10, 20]), 30);
  assert.equal(totalKnownSeconds([0, 5]), 5);
  assert.equal(totalKnownSeconds([10, null]), null);
  assert.equal(totalKnownSeconds([]), null);
});

test("average and median ignore nothing and stay whole seconds", () => {
  assert.deepEqual(averageAndMedian([]), { avg: null, median: null });
  assert.deepEqual(averageAndMedian([10, 40]), { avg: 25, median: 25 });
  assert.deepEqual(averageAndMedian([10, 20, 90]), { avg: 40, median: 20 });
});

test("duration reads as minutes and seconds", () => {
  assert.equal(formatMarathonDuration(750, "uk"), "12 хв 30 с");
  assert.equal(formatMarathonDuration(45, "uk"), "45 с");
  assert.equal(formatMarathonDuration(120, "uk"), "2 хв");
  assert.equal(formatMarathonDuration(0, "uk"), "0 с");
  assert.equal(formatMarathonDuration(3661, "en"), "1 h 1 min 1 s");
  assert.equal(formatMarathonDuration(null, "uk"), "");
  assert.equal(botDayTimeNote(750, null), "Час цього дня: 12 хв 30 с\nЗагальний час: невідомий");
});
