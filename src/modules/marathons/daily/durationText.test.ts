import assert from "node:assert/strict";
import test from "node:test";
import {
  averageAndMedian,
  botDayTimeNote,
  durationSeconds,
  formatMarathonDuration,
  formatMarathonDurationOrDash,
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

test("duration reads as minutes and seconds, and hours without leftover seconds", () => {
  assert.equal(formatMarathonDuration(725, "uk"), "12 хв 05 с");
  assert.equal(formatMarathonDuration(750, "uk"), "12 хв 30 с");
  assert.equal(formatMarathonDuration(45, "uk"), "0 хв 45 с");
  assert.equal(formatMarathonDuration(120, "uk"), "2 хв 00 с");
  assert.equal(formatMarathonDuration(0, "uk"), "0 хв 00 с");
  assert.equal(formatMarathonDuration(3600 + 3 * 60, "uk"), "1 год 03 хв");
  assert.equal(formatMarathonDuration(3661, "en"), "1 h 01 min");
  assert.equal(formatMarathonDuration(3661, "de"), "1 Std. 01 Min.");
  assert.equal(formatMarathonDuration(null, "uk"), "");
  assert.equal(formatMarathonDurationOrDash(null, "uk"), "—");
  assert.equal(botDayTimeNote(725, null), "Час цього дня: 12 хв 05 с\nЗагальний час: —");
});
