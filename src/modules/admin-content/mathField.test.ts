import assert from "node:assert/strict";
import test from "node:test";

import {
  fromAdminPlainText,
  remainingTexCommands,
  toAdminInput,
  wrapMathForStorage,
  wrapRichTextForStorage,
} from "./mathField";

test("toAdminInput converts sqrt, circ, pi, cdot, shorthand frac", () => {
  assert.equal(
    toAdminInput("Сторона квадрата $a=\\sqrt{49}=7$ см."),
    "Сторона квадрата a=√49=7 см.",
  );
  assert.equal(
    toAdminInput("$c=\\sqrt{6^2+8^2}=\\sqrt{100}=10$ см."),
    "c=√(6^2+8^2)=√100=10 см.",
  );
  assert.equal(toAdminInput("$68^\\circ$"), "68°");
  assert.equal(toAdminInput("$6\\pi$ см"), "6π см");
  assert.equal(toAdminInput("$18-3\\cdot4+6$"), "18-3·4+6");
  assert.equal(toAdminInput("$\\frac{3}{4}$"), "3/4");
  assert.equal(toAdminInput("$\\frac12$"), "1/2");
  assert.equal(toAdminInput("$\\frac7{12}$"), "7/12");
  assert.equal(toAdminInput("$1\\frac12$"), "1 1/2");
  assert.equal(toAdminInput("$\\left(\\frac{3}{4}+\\frac{5}{6}\\right)$"), "(3/4+5/6)");
  assert.equal(toAdminInput("$\\sin 30^\\circ$"), "sin 30°");
  assert.equal(toAdminInput("$2\\cdot\\cos\\alpha$"), "2· cos α");
  assert.equal(toAdminInput("$\\frac{1}{2}\\arctan\\frac{x}{2}+C$"), "1/2 arctan x/2+C");
  assert.equal(toAdminInput("$(-\\infty;3]$"), "(-∞;3]");
  assert.equal(toAdminInput("$\\angle A$"), "∠A");
  assert.deepEqual(remainingTexCommands("$a=\\sqrt{49}$"), []);
  assert.deepEqual(remainingTexCommands("$\\frac12+\\frac34$"), []);
  assert.deepEqual(remainingTexCommands("$2\\cdot\\cos\\alpha$"), []);
});

test("fromAdminPlainText round-trips plain symbols", () => {
  assert.equal(fromAdminPlainText("√49"), "\\sqrt{49}");
  assert.equal(fromAdminPlainText("√(6^2+8^2)"), "\\sqrt{6^2+8^2}");
  assert.equal(fromAdminPlainText("68°"), "68^\\circ");
  assert.equal(fromAdminPlainText("6π"), "6\\pi");
  assert.equal(fromAdminPlainText("18 - 3 · 4"), "18 - 3 \\cdot 4");
  assert.equal(fromAdminPlainText("3/4"), "\\frac{3}{4}");
  assert.equal(fromAdminPlainText("1 1/2"), "1\\frac{1}{2}");
  assert.equal(fromAdminPlainText("sin 30°"), "\\sin 30^\\circ");
});

test("wrapRichTextForStorage keeps Ukrainian prose with sqrt", () => {
  assert.equal(
    wrapRichTextForStorage("Сторона квадрата a=√49=7 см."),
    "Сторона квадрата $a=\\sqrt{49}=7$ см.",
  );
});

test("wrapMathForStorage wraps plain numbers", () => {
  assert.equal(wrapMathForStorage("12"), "$12$");
  assert.equal(wrapMathForStorage("8,5"), "$8{,}5$");
});
