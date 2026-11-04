import assert from "node:assert/strict";
import test from "node:test";
import { promptWithoutCopiedOptions, stripCopiedOptionLines } from "./promptOptions";

test("a trailing option block that matches the buttons is removed", () => {
  const prompt = "Як записати 6 · 4 + 11, якщо d = 6 · 4?\n\nА. d · 11\nБ. d − 11\nВ. d + 11\nГ. d : 11";
  const options = ["d · 11", "d − 11", "d + 11", "d : 11"];
  assert.equal(
    stripCopiedOptionLines(prompt, options),
    "Як записати 6 · 4 + 11, якщо d = 6 · 4?",
  );
  assert.equal(
    stripCopiedOptionLines("Question\n\nA. less\nB) greater", ["less", "greater"]),
    "Question",
  );
  assert.equal(
    stripCopiedOptionLines("Умова\n\nА. кіт\n\nБ. пес\n", ["кіт", "пес"]),
    "Умова",
  );
  assert.equal(
    stripCopiedOptionLines("Спростіть\n\nА. $x^2$\nБ. $y^2$", ["x²", "y²"]),
    "Спростіть",
  );
  assert.equal(
    stripCopiedOptionLines("Обери\nА. a & b\nБ. a < b", ["a & b", "a < b"]),
    "Обери",
  );
});

test("a prompt keeps lettered lines that are not a copy of its options", () => {
  const question = "Порівняйте приклад А. 2 < 0 у самій умові.";
  assert.equal(stripCopiedOptionLines(question, ["<", ">"]), question);

  const middle = "Приклад:\nА. 2 < 0\nБ. 2 > 0\nЯкий знак у виразі?";
  assert.equal(stripCopiedOptionLines(middle, ["2 < 0", "2 > 0"]), middle);

  const different = "Умова\nА. кіт\nБ. пес";
  assert.equal(stripCopiedOptionLines(different, ["кит", "пес"]), different);

  const oneLine = "Умова\nА. кіт";
  assert.equal(stripCopiedOptionLines(oneLine, ["кіт", "пес"]), oneLine);

  const laterLetters = "Умова\nВ. кіт\nГ. пес";
  assert.equal(stripCopiedOptionLines(laterLetters, ["кіт", "пес", "кіт", "пес"]), laterLetters);

  assert.equal(stripCopiedOptionLines("А. 3\nБ. 4", ["3", "4"]), "");
  assert.equal(promptWithoutCopiedOptions("А. 3\nБ. 4", ["3", "4"]), "А. 3\nБ. 4");
});
