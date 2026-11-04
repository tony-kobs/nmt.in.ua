import assert from "node:assert/strict";
import test from "node:test";

import { proposeShortHint } from "./short-hint.mjs";

const triangle = {
  taskText:
    "У трикутнику одна сторона дорівнює 12 см, а середня лінія, паралельна другій стороні, – 5 см. Знайдіть периметр трикутника, якщо третя сторона дорівнює 13 см.",
  comments: "Тому P=12+10+13=35 см.",
  answers: ["30 см", "35 см", "40 см", "45 см"],
  rightAnswer: 2,
};

const inequality = {
  taskText:
    "Знайдіть найбільше ціле число, що задовольняє подвійну нерівність −2 ≤ (2x−3)/5 < 3.",
  comments: "Маємо −10 ≤ 2x − 3 < 15, тому −7 ≤ 2x < 18. Найбільше ціле значення — 8.",
  answers: ["7", "8", "9", "10"],
  rightAnswer: 2,
};

test("screenshot tasks get a nudge and not the final number", () => {
  const perimeter = proposeShortHint(triangle);
  const bound = proposeShortHint(inequality);
  assert.match(perimeter, /Середня лінія/);
  assert.equal(perimeter.includes("35"), false);
  assert.equal(perimeter.includes("10"), false);
  assert.match(bound, /нерівн|частин/i);
  assert.equal(bound.includes("8"), false);
});

test("an answer key alone does not become a hint, arithmetic still gets a step", () => {
  assert.equal(
    proposeShortHint({
      taskText: "Обчисліть: 12 + 8",
      comments: "Правильна відповідь: 20",
      answers: ["18", "20", "22", "19"],
      rightAnswer: 2,
    }),
    "Додайте числа.",
  );
  assert.equal(
    proposeShortHint({
      taskText: "Що зображено на малюнку?",
      comments: "Правильна відповідь: Б",
      answers: ["А", "Б", "В", "Г"],
      rightAnswer: 2,
    }),
    null,
  );
});
