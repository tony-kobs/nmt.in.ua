import assert from "node:assert/strict";
import test from "node:test";
import { pickRandomId, sampleRandomIds } from "./sampleRandomIds";

test("sampleRandomIds returns at most limit distinct ids from the pool", () => {
  const pool = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const picked = sampleRandomIds(pool, 4);
  assert.equal(picked.length, 4);
  assert.equal(new Set(picked).size, 4);
  for (const id of picked) {
    assert.ok(pool.includes(id));
  }
});

test("sampleRandomIds returns the whole pool when limit >= length", () => {
  const pool = [3, 1, 2];
  const picked = sampleRandomIds(pool, 10);
  assert.equal(picked.length, 3);
  assert.deepEqual([...picked].sort((a, b) => a - b), [1, 2, 3]);
});

test("sampleRandomIds handles empty input", () => {
  assert.deepEqual(sampleRandomIds([], 5), []);
  assert.deepEqual(sampleRandomIds([1, 2], 0), []);
});

test("pickRandomId returns null for an empty list", () => {
  assert.equal(pickRandomId([]), null);
  assert.ok([1, 2, 3].includes(pickRandomId([1, 2, 3])!));
});
