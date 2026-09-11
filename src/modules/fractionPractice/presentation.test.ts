import assert from "node:assert/strict";
import test from "node:test";
import {
  generateFractionAdditionTask,
  type FractionAdditionSumTask,
} from "@/modules/problemGenerators";
import {
  buildFractionPracticeQuestion,
  fractionQuestionSignature,
} from "./presentation";

function makeSumTask(
  denominator: number,
  numerators: number[],
): FractionAdditionSumTask {
  const operands = numerators.map((numerator) => ({ numerator, denominator }));
  const total = numerators.reduce((sum, n) => sum + n, 0);
  return {
    kind: "sum",
    topic: "fraction-addition-same-denominator",
    operation: "addition",
    difficulty: 1,
    denominator,
    operands,
    answer: {
      unreduced: { numerator: total, denominator },
      reduced: { numerator: total, denominator },
      requiresReduction: false,
      isImproper: total >= denominator,
      whole: null,
      mixed: null,
      acceptRule: "anyEquivalent",
    },
  };
}

test("builds a two-operand sum question with no answer leaked", () => {
  const task = generateFractionAdditionTask({ level: 1, seed: 1 });
  const question = buildFractionPracticeQuestion(task);

  assert.equal(question.kind, "sum");
  if (question.kind !== "sum") return;
  assert.equal(question.operandNumerators.length, 2);
  assert.match(question.questionMath, /^\$.*\$$/);
  assert.doesNotMatch(question.questionMath, /=\s*\\dfrac/);
  assert.equal(JSON.stringify(question).includes('"answer"'), false);
});

test("builds a three-operand sum question for level 5 'sum' sub-kind", () => {
  const task = generateFractionAdditionTask({ level: 5, seed: 2, subKind: "sum" });
  const question = buildFractionPracticeQuestion(task);

  assert.equal(question.kind, "sum");
  if (question.kind !== "sum") return;
  assert.equal(question.operandNumerators.length, 3);
  assert.equal(question.questionMath.split("+").length, 3);
});

test("builds a missing-numerator question with the blank on the requested side", () => {
  const task = generateFractionAdditionTask({
    level: 5,
    seed: 3,
    subKind: "missingNumerator",
  });
  const question = buildFractionPracticeQuestion(task);

  assert.equal(question.kind, "missingNumerator");
  if (question.kind !== "missingNumerator") return;
  const blankIndex = question.questionMath.indexOf("{?}");
  const knownIndex = question.questionMath.indexOf(`{${question.knownNumerator}}`);
  if (question.unknownPosition === "first") {
    assert.ok(blankIndex < knownIndex);
  } else {
    assert.ok(knownIndex < blankIndex);
  }
  assert.equal(Object.hasOwn(question, "missingNumerator"), false);
});

test("fractionQuestionSignature is stable for identical questions and differs for different ones", () => {
  const taskA = makeSumTask(7, [2, 3]);
  const taskB = makeSumTask(7, [2, 3]);
  const taskC = makeSumTask(7, [3, 2]);

  const sigA = fractionQuestionSignature(buildFractionPracticeQuestion(taskA));
  const sigB = fractionQuestionSignature(buildFractionPracticeQuestion(taskB));
  const sigC = fractionQuestionSignature(buildFractionPracticeQuestion(taskC));

  assert.equal(sigA, sigB);
  assert.notEqual(sigA, sigC);
});
