import assert from "node:assert/strict";
import test from "node:test";

import {
  formatTime,
  generateMultipliers,
  getFeedbackKey,
  getPoints,
  getTimerTone,
} from "./scoring";

test("points depend on the answer time", () => {
  assert.equal(getPoints(0), 10);
  assert.equal(getPoints(9.99), 10);
  assert.equal(getPoints(10), 9);
  assert.equal(getPoints(14.99), 9);
  assert.equal(getPoints(15), 8);
  assert.equal(getPoints(19.99), 8);
  assert.equal(getPoints(20), 7);
  assert.equal(getPoints(60), 7);
});

test("timer tone follows the same time ranges", () => {
  assert.equal(getTimerTone(9.99), "green");
  assert.equal(getTimerTone(10), "yellow");
  assert.equal(getTimerTone(15), "orange");
  assert.equal(getTimerTone(20), "red");
});

test("feedback depends on the total score", () => {
  assert.equal(getFeedbackKey(100), "excellent");
  assert.equal(getFeedbackKey(99), "good");
  assert.equal(getFeedbackKey(70), "good");
  assert.equal(getFeedbackKey(69), "ok");
  assert.equal(getFeedbackKey(40), "ok");
  assert.equal(getFeedbackKey(39), "tryAgain");
  assert.equal(getFeedbackKey(0), "tryAgain");
});

test("multipliers are generated in the range 1..10", () => {
  const low = generateMultipliers(3, () => 0);
  const high = generateMultipliers(3, () => 0.999);
  assert.deepEqual(low, [1, 1, 1]);
  assert.deepEqual(high, [10, 10, 10]);
  assert.equal(generateMultipliers(10).length, 10);
});

test("time is formatted as mm:ss", () => {
  assert.equal(formatTime(0), "00:00");
  assert.equal(formatTime(5999), "00:05");
  assert.equal(formatTime(65000), "01:05");
});
