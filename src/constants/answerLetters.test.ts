import assert from "node:assert/strict";
import test from "node:test";

import { ANSWER_LETTERS, answerLetter } from "./answerLetters";

test("answer letters stay Cyrillic and slicing keeps each caller's length", () => {
  assert.deepEqual(ANSWER_LETTERS.slice(0, 4), ["А", "Б", "В", "Г"]);
  assert.deepEqual(ANSWER_LETTERS.slice(0, 5), ["А", "Б", "В", "Г", "Д"]);
  assert.equal(answerLetter(0), "А");
  assert.equal(answerLetter(4), "Д");
  assert.equal(answerLetter(7), "Ж");
  assert.equal(answerLetter(8), "9");
});
