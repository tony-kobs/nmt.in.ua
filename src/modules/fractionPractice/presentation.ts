/**
 * Turns a generated `FractionAdditionTask` into the shape the Practice UI
 * renders — a KaTeX-ready question string plus enough structural metadata to
 * pick an input widget. Never includes `task.answer` / `missingNumerator`:
 * this is the "public" half of the task, safe to send to the client, mirror
 * of how `getSessionTasks.ts` strips `right_answer_n` off a DB-backed task.
 */

import type { FractionAdditionTask } from "@/modules/problemGenerators";

export type FractionPracticeQuestion =
  | {
      kind: "sum";
      difficulty: FractionAdditionTask["difficulty"];
      denominator: number;
      operandNumerators: number[];
      questionMath: string;
    }
  | {
      kind: "missingNumerator";
      difficulty: 5;
      denominator: number;
      knownNumerator: number;
      unknownPosition: "first" | "second";
      resultNumerator: number;
      questionMath: string;
    };

function fracTerm(numerator: number | "?", denominator: number): string {
  return `\\dfrac{${numerator}}{${denominator}}`;
}

export function buildFractionPracticeQuestion(
  task: FractionAdditionTask,
): FractionPracticeQuestion {
  if (task.kind === "sum") {
    const terms = task.operands.map((operand) =>
      fracTerm(operand.numerator, operand.denominator),
    );
    return {
      kind: "sum",
      difficulty: task.difficulty,
      denominator: task.denominator,
      operandNumerators: task.operands.map((operand) => operand.numerator),
      questionMath: `$${terms.join(" + ")} = \\;?$`,
    };
  }

  const known = fracTerm(task.knownOperand.numerator, task.denominator);
  const unknown = fracTerm("?", task.denominator);
  const result = fracTerm(task.result.numerator, task.denominator);
  const left =
    task.unknownOperandPosition === "first"
      ? `${unknown} + ${known}`
      : `${known} + ${unknown}`;

  return {
    kind: "missingNumerator",
    difficulty: 5,
    denominator: task.denominator,
    knownNumerator: task.knownOperand.numerator,
    unknownPosition: task.unknownOperandPosition,
    resultNumerator: task.result.numerator,
    questionMath: `$${left} = ${result}$`,
  };
}

/** Identifies a question by its visible content (not its seed) — used to
 * avoid handing the student the same task twice in a row. Two different
 * seeds can legitimately produce an identical-looking task. */
export function fractionQuestionSignature(
  question: FractionPracticeQuestion,
): string {
  if (question.kind === "sum") {
    return `sum:${question.denominator}:${question.operandNumerators.join(",")}`;
  }
  return `missing:${question.denominator}:${question.knownNumerator}:${question.unknownPosition}:${question.resultNumerator}`;
}
