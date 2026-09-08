import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveAnswerCardState,
  resolveAnswerFeedbackKind,
} from "./answerCardState";

test("an unselected card is always default, regardless of mode or result", () => {
  for (const mode of ["standard", "ultimate", "diagnostic"] as const) {
    assert.equal(
      resolveAnswerCardState({
        mode,
        isUltimate: mode === "ultimate",
        isSelected: false,
        correct: true,
      }),
      "default",
    );
  }
});

test("diagnostic mode never reveals correct/incorrect on the selected card", () => {
  assert.equal(
    resolveAnswerCardState({
      mode: "diagnostic",
      isUltimate: false,
      isSelected: true,
      correct: true,
    }),
    "selected",
  );
  assert.equal(
    resolveAnswerCardState({
      mode: "diagnostic",
      isUltimate: false,
      isSelected: true,
      correct: false,
    }),
    "selected",
  );
});

test("standard mode reveals correct/incorrect once the answer is checked", () => {
  assert.equal(
    resolveAnswerCardState({
      mode: "standard",
      isUltimate: false,
      isSelected: true,
      correct: true,
    }),
    "correct",
  );
  assert.equal(
    resolveAnswerCardState({
      mode: "standard",
      isUltimate: false,
      isSelected: true,
      correct: false,
    }),
    "incorrect",
  );
});

test("standard mode shows only 'selected' before the check result arrives", () => {
  assert.equal(
    resolveAnswerCardState({
      mode: "standard",
      isUltimate: false,
      isSelected: true,
      correct: undefined,
    }),
    "selected",
  );
});

test("ultimate mode never colors the card correct/incorrect, even with a result", () => {
  assert.equal(
    resolveAnswerCardState({
      mode: "ultimate",
      isUltimate: true,
      isSelected: true,
      correct: true,
    }),
    "selected",
  );
});

test("resolveAnswerFeedbackKind: diagnostic is always neutral", () => {
  assert.equal(resolveAnswerFeedbackKind("diagnostic", true), "neutral");
  assert.equal(resolveAnswerFeedbackKind("diagnostic", false), "neutral");
});

test("resolveAnswerFeedbackKind: standard/ultimate reflect the actual result", () => {
  assert.equal(resolveAnswerFeedbackKind("standard", true), "correct");
  assert.equal(resolveAnswerFeedbackKind("standard", false), "incorrect");
  assert.equal(resolveAnswerFeedbackKind("ultimate", true), "correct");
});
