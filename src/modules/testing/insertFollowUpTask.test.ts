import assert from "node:assert/strict";
import test from "node:test";
import { insertFollowUpTask } from "./insertFollowUpTask";

test("insertFollowUpTask places the task right after the given index", () => {
  const result = insertFollowUpTask(["t1", "t2", "t3"], 1, "similar");

  assert.deepEqual(result.list, ["t1", "t2", "similar", "t3"]);
  assert.equal(result.index, 2);
});

test("insertFollowUpTask at the last index appends to the end", () => {
  const result = insertFollowUpTask(["t1", "t2", "t3"], 2, "similar");

  assert.deepEqual(result.list, ["t1", "t2", "t3", "similar"]);
  assert.equal(result.index, 3);
});

test("insertFollowUpTask at index 0 inserts right after the first task", () => {
  const result = insertFollowUpTask(["t1", "t2"], 0, "similar");

  assert.deepEqual(result.list, ["t1", "similar", "t2"]);
  assert.equal(result.index, 1);
});

test("insertFollowUpTask does not mutate the original list", () => {
  const original = ["t1", "t2"];
  insertFollowUpTask(original, 0, "similar");

  assert.deepEqual(original, ["t1", "t2"]);
});
