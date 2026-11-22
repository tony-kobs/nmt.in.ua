import assert from "node:assert/strict";
import test from "node:test";
import { placeMenu } from "./placeMenu";

test("a menu near the bottom of a narrow screen opens upward and stays inside", () => {
  const box = placeMenu({
    top: 600,
    left: 300,
    bottom: 648,
    width: 320,
    viewportWidth: 360,
    viewportHeight: 640,
  });
  assert.ok(box.top >= 8);
  assert.ok(box.left >= 8);
  assert.ok(box.left + box.width <= 352);
  assert.ok(box.top + box.maxHeight <= 632);
  assert.ok(box.top < 600);
});

test("a menu near the right edge shifts left instead of leaving the window", () => {
  const box = placeMenu({
    top: 40,
    left: 20,
    bottom: 88,
    width: 400,
    viewportWidth: 360,
    viewportHeight: 700,
  });
  assert.equal(box.width, 344);
  assert.equal(box.left, 8);
  assert.ok(box.top >= 88);
  assert.ok(box.maxHeight >= 44);
  assert.ok(box.top + box.maxHeight <= 692);
});
