import assert from "node:assert/strict";
import test from "node:test";

import { presentTaskText, proseFromFormula } from "./presentTaskText";

test("a punctuation dash before a measure stays a dash, not a minus", () => {
  assert.equal(proseFromFormula("— 5 \\text{ см}"), "— 5 см");
  assert.equal(proseFromFormula("– 5"), "— 5");
  assert.equal(
    presentTaskText("середня лінія, паралельна другій стороні, $— 5$ см."),
    "середня лінія, паралельна другій стороні, — 5 см.",
  );
});

test("a plain number and a unit leave the math font", () => {
  assert.equal(proseFromFormula("6"), "6");
  assert.equal(proseFromFormula("10 \\text{см}"), "10 см");
  assert.equal(presentTaskText("$6$ см і $10$ см"), "6 см і 10 см");
  assert.equal(proseFromFormula("-5"), "−5");
  assert.equal(proseFromFormula("- 5 \\text{ см}"), "— 5 см");
});

test("a real formula stays delimited", () => {
  assert.equal(proseFromFormula("2x-3"), null);
  assert.equal(presentTaskText("маємо $\\dfrac{2x-3}{5}$."), "маємо $\\dfrac{2x-3}{5}$.");
});

test("a straight apostrophe between letters becomes ʼ", () => {
  assert.equal(presentTaskText("обов'язково"), "обовʼязково");
  assert.equal(presentTaskText("обов’язково"), "обовʼязково");
});
