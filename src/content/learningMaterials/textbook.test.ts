import assert from "node:assert/strict";
import test from "node:test";

import { getTextbookBlocks } from "./textbook";

const mappedThemeCodes = [
  "MATH-05-ELEM-OPS",
  "MATH-06-ARITH-OPS",
  "GEO-07-ELEM-PLAN",
  "ALG-09-EQ-INEQ",
  "ALG-08-FRACTIONS",
  "ALG-07-EXPRESSIONS",
  "GEO-07-CALC",
  "ALG-07-EQ",
  "ALG-08-POWERS-ROOTS",
  "MATH-07-WORD-PROBLEMS",
  "ALG-07-COORD-PLANE",
  "ALG-09-FUNCTIONS",
  "ALG-09-COMB-PROG",
  "MATH-09-PROBABILITY",
];

function getParagraphTexts(themeCode: string): string[] {
  return getTextbookBlocks(themeCode)
    .filter((block) => block.type === "paragraph")
    .map((block) => block.runs.map((run) => run.text).join("").trim());
}

test("getTextbookBlocks returns content for mapped themes", () => {
  mappedThemeCodes.forEach((themeCode) => {
    assert.ok(
      getTextbookBlocks(themeCode).length > 0,
      `Expected textbook content for ${themeCode}`,
    );
  });
});

test("getTextbookBlocks returns only the requested section", () => {
  const paragraphTexts = getParagraphTexts("ALG-07-EQ");

  assert.equal(
    paragraphTexts[0],
    "Рівняння — це рівність, що містить позначене буквою невідоме число, яке потрібно знайти.",
  );
  assert.equal(paragraphTexts.includes("8. Рівняння"), false);
  assert.equal(paragraphTexts.includes("12. Текстові задачі:"), false);
});

test("getTextbookBlocks combines all expression sources", () => {
  const paragraphTexts = getParagraphTexts("ALG-07-EXPRESSIONS");

  assert.ok(paragraphTexts.includes("Методи тотожних перетворень:"));
  assert.ok(paragraphTexts.includes("Порядок дій"));
  assert.ok(paragraphTexts.includes("Еквівалентні перетворення"));
  assert.ok(paragraphTexts.includes("Ділення многочленів"));
  assert.ok(
    paragraphTexts.includes(
      "Множення одночленів. Піднесення одночлена до ступеня.",
    ),
  );
});

test("getTextbookBlocks combines all equation sources", () => {
  const paragraphTexts = getParagraphTexts("ALG-07-EQ");

  assert.ok(paragraphTexts.includes("Розв’язання лінійних рівнянь"));
  assert.ok(paragraphTexts.includes("Рівносильні рівняння"));
  assert.ok(
    paragraphTexts.includes("Алгоритм №1. Вирішення рівнянь:"),
  );
  assert.ok(paragraphTexts.includes("Системи рівнянь"));
});

test("getTextbookBlocks combines all powers and roots sources", () => {
  const paragraphTexts = getParagraphTexts("ALG-08-POWERS-ROOTS");

  assert.ok(paragraphTexts.includes("Властивості ступеня"));
  assert.ok(paragraphTexts.includes("Піднесення до ступеня"));
  assert.ok(paragraphTexts.includes("Корені"));
});

test("getTextbookBlocks combines all word-problem sources", () => {
  const paragraphTexts = getParagraphTexts("MATH-07-WORD-PROBLEMS");

  assert.ok(
    paragraphTexts.includes(
      "Рівняння, складене за умовою реальної ситуації, називають математичною моделлю даної ситуації.",
    ),
  );
  assert.ok(paragraphTexts.includes("Розв’язування задач"));
});

test("getTextbookBlocks combines both function sources", () => {
  const paragraphTexts = getParagraphTexts("ALG-09-FUNCTIONS");

  assert.ok(paragraphTexts.includes("Нуль функції"));
  assert.ok(paragraphTexts.includes("Функція"));
});

test("getTextbookBlocks returns no content for an unmapped theme", () => {
  assert.deepEqual(getTextbookBlocks("ALG-11-LOGARITHMS"), []);
});