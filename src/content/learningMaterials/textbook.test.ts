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

test("getTextbookBlocks returns content for mapped themes", () => {
  mappedThemeCodes.forEach((themeCode) => {
    assert.ok(
      getTextbookBlocks(themeCode).length > 0,
      `Expected textbook content for ${themeCode}`,
    );
  });
});

test("getTextbookBlocks returns only the requested section", () => {
  const blocks = getTextbookBlocks("ALG-07-EQ");
  const paragraphTexts = blocks
    .filter((block) => block.type === "paragraph")
    .map((block) => block.runs.map((run) => run.text).join("").trim());

  assert.equal(
    paragraphTexts[0],
    "Рівняння — це рівність, що містить позначене буквою невідоме число, яке потрібно знайти",
  );
  assert.equal(paragraphTexts.includes("8. Рівняння"), false);
  assert.equal(paragraphTexts.includes("12. Текстові задачі:"), false);
});

test("getTextbookBlocks returns no content for an unmapped theme", () => {
  assert.deepEqual(getTextbookBlocks("ALG-11-LOGARITHMS"), []);
});