import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clampTaskCount,
  MAX_TOPIC_TEST_TASKS,
  parseRequestedTaskCount,
  previewTaskCount,
  taskLimitForMode,
  ULTIMATE_TASK_LIMIT,
  TOPIC_TEST_TASK_COUNT,
} from "./topicTestMode";

test("taskLimitForMode returns 10 for standard and 20 for ultimate", () => {
  assert.equal(taskLimitForMode("standard"), TOPIC_TEST_TASK_COUNT);
  assert.equal(taskLimitForMode("ultimate"), ULTIMATE_TASK_LIMIT);
});

test("previewTaskCount caps by bank size", () => {
  assert.equal(previewTaskCount("standard", 25), 10);
  assert.equal(previewTaskCount("ultimate", 25), 20);
  assert.equal(previewTaskCount("ultimate", 8), 8);
});

test("parseRequestedTaskCount accepts integers from 1 to MAX", () => {
  assert.equal(parseRequestedTaskCount("7"), 7);
  assert.equal(parseRequestedTaskCount(1), 1);
  assert.equal(parseRequestedTaskCount(MAX_TOPIC_TEST_TASKS), MAX_TOPIC_TEST_TASKS);
  assert.equal(parseRequestedTaskCount("0"), null);
  assert.equal(parseRequestedTaskCount("abc"), null);
  assert.equal(parseRequestedTaskCount("5.5"), null);
  assert.equal(parseRequestedTaskCount(MAX_TOPIC_TEST_TASKS + 1), null);
  assert.equal(parseRequestedTaskCount(""), null);
});

test("clampTaskCount never exceeds the bank", () => {
  assert.equal(clampTaskCount(7, 36), 7);
  assert.equal(clampTaskCount(40, 36), 36);
  assert.equal(clampTaskCount(0, 36), 1);
  assert.equal(clampTaskCount(5, 0), 0);
});
