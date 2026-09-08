import type { TrainerMode } from "./types";

export type AnswerCardVisualState = "default" | "selected" | "correct" | "incorrect";

type ResolveAnswerCardStateInput = {
  mode: TrainerMode;
  isUltimate: boolean;
  /** Is this particular answer card the one the student picked? */
  isSelected: boolean;
  /** `checkResult?.correct` for the current task, `undefined` before an
   * answer has been recorded. */
  correct: boolean | undefined;
};

/**
 * Pure UI-state derivation, extracted out of `TopicTrainer` so diagnostic
 * integrity ("never reveal correctness before the diagnostic ends") is a
 * unit-testable rule instead of a JSX conditional. Only the selected card
 * ever changes state — an unselected card always stays "default", exactly
 * like before this was extracted.
 */
export function resolveAnswerCardState({
  mode,
  isUltimate,
  isSelected,
  correct,
}: ResolveAnswerCardStateInput): AnswerCardVisualState {
  if (!isSelected) return "default";

  // Ultimate advances to the next task immediately after recording the
  // answer, so the only visible moment for the selected card is the instant
  // before that happens (`correct` still undefined) — never a colored state.
  if (isUltimate) return "selected";

  if (mode === "diagnostic") return "selected";

  if (correct === undefined) return "selected";
  return correct ? "correct" : "incorrect";
}

export type AnswerFeedbackKind = "correct" | "incorrect" | "neutral";

/**
 * Diagnostic mode must not teach the answer mid-test: it always reports the
 * neutral "answer saved" message, regardless of whether the pick was right.
 */
export function resolveAnswerFeedbackKind(
  mode: TrainerMode,
  correct: boolean,
): AnswerFeedbackKind {
  if (mode === "diagnostic") return "neutral";
  return correct ? "correct" : "incorrect";
}
