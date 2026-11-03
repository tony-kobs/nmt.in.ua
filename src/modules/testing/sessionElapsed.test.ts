import assert from "node:assert/strict";
import test from "node:test";
import {
  formatElapsedClock,
  NMT_DURATION_SEC,
  remainingExamSeconds,
  resolveSessionElapsedSec,
} from "./sessionElapsed";

test("resolveSessionElapsedSec uses now minus start_time", () => {
  assert.deepEqual(resolveSessionElapsedSec(1_700_000_000, 1_700_000_080), {
    timeSec: 80,
    startTime: 1_700_000_000,
  });
});

test("resolveSessionElapsedSec stores at least 1 second", () => {
  assert.deepEqual(resolveSessionElapsedSec(1_700_000_000, 1_700_000_000), {
    timeSec: 1,
    startTime: 1_700_000_000,
  });
});

test("resolveSessionElapsedSec fills missing start_time", () => {
  assert.deepEqual(resolveSessionElapsedSec(0, 1_700_000_050), {
    timeSec: 1,
    startTime: 1_700_000_050,
  });
});

test("remainingExamSeconds follows the server start and stops at zero", () => {
  const start = 1_700_000_000;
  assert.equal(remainingExamSeconds(start, start, NMT_DURATION_SEC), NMT_DURATION_SEC);
  assert.equal(remainingExamSeconds(start, start + 90, NMT_DURATION_SEC), NMT_DURATION_SEC - 90);
  assert.equal(remainingExamSeconds(start, start + NMT_DURATION_SEC, NMT_DURATION_SEC), 0);
  assert.equal(remainingExamSeconds(start, start + NMT_DURATION_SEC + 30, NMT_DURATION_SEC), 0);
  assert.equal(remainingExamSeconds(0, start, NMT_DURATION_SEC), NMT_DURATION_SEC);
});

test("formatElapsedClock pads minutes and seconds", () => {
  assert.equal(formatElapsedClock(0), "00:00");
  assert.equal(formatElapsedClock(5), "00:05");
  assert.equal(formatElapsedClock(75), "01:15");
  assert.equal(formatElapsedClock(90 * 60), "90:00");
});
