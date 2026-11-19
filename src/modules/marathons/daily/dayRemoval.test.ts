import assert from "node:assert/strict";
import test from "node:test";
import { planDayRemoval } from "./dayRemoval";

test("removing a middle day closes the gap and keeps earlier days", () => {
  assert.deepEqual(planDayRemoval([1, 2, 3, 4], 2), [
    { from: 1, to: 1 },
    { from: 3, to: 2 },
    { from: 4, to: 3 },
  ]);
});

test("removing the first day renumbers whatever is left from 1", () => {
  assert.deepEqual(planDayRemoval([1, 3], 1), [{ from: 3, to: 1 }]);
});

test("removing the only day leaves an empty plan", () => {
  assert.deepEqual(planDayRemoval([2], 2), []);
});
