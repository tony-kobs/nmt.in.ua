import assert from "node:assert/strict";
import test from "node:test";
import { generateFractionAdditionTask } from "@/modules/problemGenerators";
import { buildFractionPracticeQuestion, fractionQuestionSignature } from "./presentation";
import {
  checkFractionPracticeAnswerAction,
  nextFractionPracticeTaskAction,
  startFractionPracticeTaskAction,
} from "./actions";

const authDeps = { requireUserId: async () => 42 };

test("startFractionPracticeTaskAction rejects an out-of-range level without calling auth", async () => {
  let authCalled = false;
  const result = await startFractionPracticeTaskAction(
    { level: 6 },
    { randomSeed: () => 1, requireUserId: async () => ((authCalled = true), 42) },
  );
  assert.deepEqual(result, { status: "error", code: "invalidLevel" });
  assert.equal(authCalled, false);
});

test("startFractionPracticeTaskAction requires an authenticated user", async () => {
  const result = await startFractionPracticeTaskAction(
    { level: 1 },
    {
      randomSeed: () => 1,
      requireUserId: async () => {
        throw new Error("not signed in");
      },
    },
  );
  assert.deepEqual(result, { status: "error", code: "generic" });
});

test("startFractionPracticeTaskAction returns a level-1 question with no answer field", async () => {
  const result = await startFractionPracticeTaskAction(
    { level: 1 },
    { randomSeed: () => 123, ...authDeps },
  );
  assert.equal(result.status, "success");
  if (result.status !== "success") return;
  assert.equal(result.level, 1);
  assert.equal(result.seed, 123);
  assert.equal(result.question.kind, "sum");
  assert.equal(Object.hasOwn(result.question, "answer"), false);
});

test("nextFractionPracticeTaskAction retries a few times, then stops, when every seed repeats the same task", async () => {
  // Every seed collapses to the same signature — the loop must still
  // terminate (never an unbounded retry) instead of hanging.
  const previousTask = generateFractionAdditionTask({ level: 2, seed: 10 });
  const previousSignature = fractionQuestionSignature(
    buildFractionPracticeQuestion(previousTask),
  );

  let calls = 0;
  const result = await nextFractionPracticeTaskAction(
    { level: 2, previousSignature },
    {
      randomSeed: () => {
        calls += 1;
        return 10;
      },
      ...authDeps,
    },
  );

  assert.equal(result.status, "success");
  if (result.status !== "success") return;
  assert.ok(calls <= 8);
  assert.equal(fractionQuestionSignature(result.question), previousSignature);
});

test("nextFractionPracticeTaskAction escapes as soon as a distinct seed produces a different task", async () => {
  const previousTask = generateFractionAdditionTask({ level: 2, seed: 10 });
  const previousSignature = fractionQuestionSignature(
    buildFractionPracticeQuestion(previousTask),
  );
  const differentTask = generateFractionAdditionTask({ level: 2, seed: 50 });
  const differentSignature = fractionQuestionSignature(
    buildFractionPracticeQuestion(differentTask),
  );
  assert.notEqual(previousSignature, differentSignature);

  const seeds = [10, 10, 50];
  let calls = 0;
  const result = await nextFractionPracticeTaskAction(
    { level: 2, previousSignature },
    { randomSeed: () => seeds[calls++], ...authDeps },
  );

  assert.equal(result.status, "success");
  if (result.status !== "success") return;
  assert.equal(calls, 3);
  assert.equal(fractionQuestionSignature(result.question), differentSignature);
});

test("nextFractionPracticeTaskAction accepts a fresh task immediately when it differs", async () => {
  let calls = 0;
  const result = await nextFractionPracticeTaskAction(
    { level: 1, previousSignature: "sum:999:1,2" },
    {
      randomSeed: () => {
        calls += 1;
        return 5;
      },
      ...authDeps,
    },
  );
  assert.equal(result.status, "success");
  assert.equal(calls, 1);
});

test("checkFractionPracticeAnswerAction rejects malformed input", async () => {
  const result = await checkFractionPracticeAnswerAction(
    { level: 0, seed: 1, answer: "1/2" },
    authDeps,
  );
  assert.deepEqual(result, { status: "error", code: "invalidInput" });
});

test("checkFractionPracticeAnswerAction accepts the canonical answer for a level-1 task", async () => {
  const task = generateFractionAdditionTask({ level: 1, seed: 7 });
  if (task.kind !== "sum") throw new Error("expected a sum task");
  const canonical =
    task.answer.whole !== null
      ? String(task.answer.whole)
      : task.answer.mixed
        ? `${task.answer.mixed.whole} ${task.answer.mixed.numerator}/${task.answer.mixed.denominator}`
        : `${task.answer.reduced.numerator}/${task.answer.reduced.denominator}`;

  const result = await checkFractionPracticeAnswerAction(
    { level: 1, seed: 7, answer: canonical },
    authDeps,
  );

  assert.equal(result.status, "success");
  if (result.status !== "success") return;
  assert.equal(result.isCorrect, true);
  assert.equal(result.reason, "correct");
});

test("checkFractionPracticeAnswerAction rejects an unreduced-but-equivalent answer for a reducedRequired task", async () => {
  // Find a level-3 seed whose sum is reducible (level 3 always is, by construction).
  const task = generateFractionAdditionTask({ level: 3, seed: 4 });
  if (task.kind !== "sum") throw new Error("expected a sum task");
  assert.equal(task.answer.acceptRule, "reducedRequired");
  const unreduced = `${task.answer.unreduced.numerator}/${task.answer.unreduced.denominator}`;

  const result = await checkFractionPracticeAnswerAction(
    { level: 3, seed: 4, answer: unreduced },
    authDeps,
  );

  assert.equal(result.status, "success");
  if (result.status !== "success") return;
  assert.equal(result.isMathematicallyEquivalent, true);
  assert.equal(result.isCorrect, false);
  assert.equal(result.reason, "reductionRequired");
});

test("checkFractionPracticeAnswerAction validates the missing-numerator answer as a plain integer", async () => {
  // Regenerated the same way the action does (no `subKind` override) so the
  // rng stream — and therefore the task — matches exactly.
  const task = generateFractionAdditionTask({ level: 5, seed: 1 });
  if (task.kind !== "missingNumerator") throw new Error("expected a missingNumerator task");

  const correct = await checkFractionPracticeAnswerAction(
    { level: 5, seed: 1, answer: String(task.missingNumerator) },
    authDeps,
  );
  assert.equal(correct.status, "success");
  if (correct.status !== "success") return;
  assert.equal(correct.isCorrect, true);

  const wrong = await checkFractionPracticeAnswerAction(
    { level: 5, seed: 1, answer: String(task.missingNumerator + 1) },
    authDeps,
  );
  assert.equal(wrong.status, "success");
  if (wrong.status !== "success") return;
  assert.equal(wrong.isCorrect, false);
});

test("checkFractionPracticeAnswerAction reports invalid formats without crashing", async () => {
  const result = await checkFractionPracticeAnswerAction(
    { level: 1, seed: 7, answer: "not a fraction" },
    authDeps,
  );
  assert.equal(result.status, "success");
  if (result.status !== "success") return;
  assert.equal(result.isCorrect, false);
  assert.equal(result.reason, "invalidFormat");
});
