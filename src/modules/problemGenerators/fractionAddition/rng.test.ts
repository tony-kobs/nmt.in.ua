import assert from "node:assert/strict";
import test from "node:test";
import { createSeededRandom, pickRandom, randomInt } from "./rng";

test("createSeededRandom is deterministic for a given seed", () => {
  const a = createSeededRandom(42);
  const b = createSeededRandom(42);
  const sequenceA = Array.from({ length: 20 }, () => a());
  const sequenceB = Array.from({ length: 20 }, () => b());
  assert.deepEqual(sequenceA, sequenceB);
});

test("createSeededRandom produces values in [0, 1)", () => {
  const rng = createSeededRandom(7);
  for (let i = 0; i < 500; i += 1) {
    const value = rng();
    assert.ok(value >= 0 && value < 1, `value out of range: ${value}`);
  }
});

test("different seeds produce different sequences", () => {
  const a = createSeededRandom(1);
  const b = createSeededRandom(2);
  const sequenceA = Array.from({ length: 10 }, () => a());
  const sequenceB = Array.from({ length: 10 }, () => b());
  assert.notDeepEqual(sequenceA, sequenceB);
});

test("randomInt stays within an inclusive range", () => {
  const rng = createSeededRandom(123);
  for (let i = 0; i < 200; i += 1) {
    const value = randomInt(rng, 3, 9);
    assert.ok(Number.isInteger(value));
    assert.ok(value >= 3 && value <= 9, `value out of range: ${value}`);
  }
});

test("randomInt with min === max always returns that value", () => {
  const rng = createSeededRandom(5);
  assert.equal(randomInt(rng, 4, 4), 4);
});

test("randomInt throws on an empty range", () => {
  const rng = createSeededRandom(5);
  assert.throws(() => randomInt(rng, 5, 4));
});

test("pickRandom only returns items from the given list", () => {
  const rng = createSeededRandom(9);
  const items = ["a", "b", "c"] as const;
  for (let i = 0; i < 50; i += 1) {
    assert.ok(items.includes(pickRandom(rng, items)));
  }
});

test("pickRandom throws on an empty list", () => {
  const rng = createSeededRandom(9);
  assert.throws(() => pickRandom(rng, []));
});
