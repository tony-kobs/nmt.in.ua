import assert from "node:assert/strict";
import test from "node:test";
import {
  ADAPTIVE_STREAK_THRESHOLD,
  MAX_TASK_DIFFICULTY,
  nextPracticeStreak,
  resolvePreferredDifficulty,
} from "./practiceAdaptive";

test("nextPracticeStreak extends on correct, resets to 0 on incorrect", () => {
  assert.equal(nextPracticeStreak(0, true), 1);
  assert.equal(nextPracticeStreak(2, true), 3);
  assert.equal(nextPracticeStreak(5, false), 0);
  assert.equal(nextPracticeStreak(0, false), 0);
});

test("resolvePreferredDifficulty has no preference below the streak threshold", () => {
  assert.equal(resolvePreferredDifficulty(1, 0), null);
  assert.equal(resolvePreferredDifficulty(1, ADAPTIVE_STREAK_THRESHOLD - 1), null);
});

test("resolvePreferredDifficulty prefers one tier harder at/above the threshold", () => {
  assert.equal(resolvePreferredDifficulty(1, ADAPTIVE_STREAK_THRESHOLD), 2);
  assert.equal(resolvePreferredDifficulty(2, ADAPTIVE_STREAK_THRESHOLD + 5), 3);
});

test("resolvePreferredDifficulty never exceeds MAX_TASK_DIFFICULTY", () => {
  assert.equal(
    resolvePreferredDifficulty(MAX_TASK_DIFFICULTY, ADAPTIVE_STREAK_THRESHOLD),
    MAX_TASK_DIFFICULTY,
  );
});

test("resolvePreferredDifficulty returns null when difficulty data is missing or invalid, even with a long streak", () => {
  assert.equal(resolvePreferredDifficulty(null, 99), null);
  assert.equal(resolvePreferredDifficulty(undefined, 99), null);
  assert.equal(resolvePreferredDifficulty(0, 99), null);
  assert.equal(resolvePreferredDifficulty(4, 99), null);
  assert.equal(resolvePreferredDifficulty("2", 99), null);
});
