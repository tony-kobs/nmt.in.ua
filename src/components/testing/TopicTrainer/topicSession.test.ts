import assert from "node:assert/strict";
import test from "node:test";

import { TASK_STATUS_CORRECT, TASK_STATUS_INCORRECT, TASK_STATUS_UNANSWERED } from "@/modules/testing/types";
import { clampTaskIndex, initialAnswerResults } from "./topicSession";

test("initialAnswerResults restores correct and incorrect rows only", () => {
  const results = initialAnswerResults([
    { mappingId: 1, status: TASK_STATUS_CORRECT },
    { mappingId: 2, status: TASK_STATUS_UNANSWERED },
    {
      mappingId: 3,
      status: TASK_STATUS_INCORRECT,
      retryAvailable: true,
      revealed: { correctAnswerNumber: 2, correctAnswerText: "два", explanation: null },
    },
  ]);
  assert.deepEqual(results[1], { correct: true });
  assert.equal(results[2], undefined);
  assert.equal(results[3]?.retryAvailable, true);
  assert.equal(results[3]?.revealed?.correctAnswerNumber, 2);
});

test("clampTaskIndex keeps the trainer on a task", () => {
  assert.equal(clampTaskIndex(-3, 10), 0);
  assert.equal(clampTaskIndex(4, 10), 4);
  assert.equal(clampTaskIndex(40, 10), 9);
  assert.equal(clampTaskIndex(2, 0), 0);
});
