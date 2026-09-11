"use server";

/**
 * Practice entry point for `problemGenerators/fractionAddition`. Deliberately
 * stateless: nothing here writes to `task_sessions` / `tasks2session` or any
 * other table. A task's full content (including the answer) is never sent to
 * the client and never persisted — it is regenerated server-side from
 * `{ level, seed }` (the generator is exactly reproducible for a given seed,
 * see `rng.ts`), both when first shown and again when the answer is checked.
 * That keeps this opt-in path from touching the `quiz_tasks`-backed session
 * pipeline (`src/modules/testing/*`) at all.
 */

import {
  generateFractionAdditionTask,
  validateFractionAdditionAnswer,
  type FractionAdditionDifficulty,
  type FractionAdditionValidationReason,
} from "@/modules/problemGenerators";
import { requireSessionUserId, type requireUserId } from "@/modules/auth/getCurrentUser";
import {
  buildFractionPracticeQuestion,
  fractionQuestionSignature,
  type FractionPracticeQuestion,
} from "./presentation";

const MIN_LEVEL = 1;
const MAX_LEVEL = 5;
/** Bounded retry so a run of bad luck can't loop forever — see AGENTS.md
 * task constraints ("no unbounded retry loops"). Denominators 4–12 make an
 * accidental repeat rare, so a handful of attempts is enough in practice. */
const MAX_DISTINCT_ATTEMPTS = 8;

function isValidLevel(value: unknown): value is FractionAdditionDifficulty {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_LEVEL &&
    value <= MAX_LEVEL
  );
}

function randomSeed(): number {
  return Math.floor(Math.random() * 0xffffffff);
}

type AuthDeps = {
  requireUserId: typeof requireUserId;
};

const defaultAuthDeps: AuthDeps = { requireUserId: requireSessionUserId };

export type FractionPracticeErrorCode = "invalidLevel" | "generic";

export type FractionPracticeTaskState =
  | {
      status: "success";
      question: FractionPracticeQuestion;
      level: FractionAdditionDifficulty;
      seed: number;
    }
  | { status: "error"; code: FractionPracticeErrorCode };

type GenerateDeps = AuthDeps & { randomSeed: typeof randomSeed };
const defaultGenerateDeps: GenerateDeps = { randomSeed, ...defaultAuthDeps };

function generateQuestion(
  level: FractionAdditionDifficulty,
  seed: number,
): FractionPracticeQuestion {
  const task = generateFractionAdditionTask({ level, seed });
  return buildFractionPracticeQuestion(task);
}

/** Server Action for starting a fraction-practice run: first task at the
 * chosen level. */
export async function startFractionPracticeTaskAction(
  input: { level: number },
  deps: GenerateDeps = defaultGenerateDeps,
): Promise<FractionPracticeTaskState> {
  if (!isValidLevel(input.level)) {
    return { status: "error", code: "invalidLevel" };
  }

  try {
    await deps.requireUserId();
    const seed = deps.randomSeed();
    return {
      status: "success",
      question: generateQuestion(input.level, seed),
      level: input.level,
      seed,
    };
  } catch (error) {
    console.error("startFractionPracticeTaskAction: unexpected error", error);
    return { status: "error", code: "generic" };
  }
}

export type NextFractionPracticeTaskInput = {
  level: number;
  /** `fractionQuestionSignature` of the task just answered — the next task
   * retries a few times to avoid repeating it verbatim. */
  previousSignature?: string;
};

/** Server Action for "Next task" during a run — same contract as start, plus
 * best-effort avoidance of an immediate repeat. */
export async function nextFractionPracticeTaskAction(
  input: NextFractionPracticeTaskInput,
  deps: GenerateDeps = defaultGenerateDeps,
): Promise<FractionPracticeTaskState> {
  if (!isValidLevel(input.level)) {
    return { status: "error", code: "invalidLevel" };
  }

  try {
    await deps.requireUserId();
    let seed = deps.randomSeed();
    let question = generateQuestion(input.level, seed);

    let attempts = 1;
    while (
      input.previousSignature !== undefined &&
      fractionQuestionSignature(question) === input.previousSignature &&
      attempts < MAX_DISTINCT_ATTEMPTS
    ) {
      seed = deps.randomSeed();
      question = generateQuestion(input.level, seed);
      attempts += 1;
    }

    return { status: "success", question, level: input.level, seed };
  } catch (error) {
    console.error("nextFractionPracticeTaskAction: unexpected error", error);
    return { status: "error", code: "generic" };
  }
}

export type CheckFractionPracticeAnswerInput = {
  level: number;
  seed: number;
  answer: string;
};

export type FractionPracticeCheckErrorCode = "invalidInput" | "generic";

export type FractionPracticeCheckState =
  | {
      status: "success";
      isCorrect: boolean;
      isMathematicallyEquivalent: boolean;
      reason: FractionAdditionValidationReason;
    }
  | { status: "error"; code: FractionPracticeCheckErrorCode };

type CheckDeps = AuthDeps;
const defaultCheckDeps: CheckDeps = { ...defaultAuthDeps };

/**
 * Server Action that checks a submitted answer. Regenerates the exact same
 * task from `{ level, seed }` — the only state the client held onto — and
 * runs it through `validateFractionAdditionAnswer`, the same pure validator
 * `fractionAddition`'s own tests use. The UI never sees `acceptRule` or the
 * task's `answer` object, only this result.
 */
export async function checkFractionPracticeAnswerAction(
  input: CheckFractionPracticeAnswerInput,
  deps: CheckDeps = defaultCheckDeps,
): Promise<FractionPracticeCheckState> {
  if (
    !isValidLevel(input.level) ||
    !Number.isInteger(input.seed) ||
    typeof input.answer !== "string"
  ) {
    return { status: "error", code: "invalidInput" };
  }

  try {
    await deps.requireUserId();
    const task = generateFractionAdditionTask({
      level: input.level,
      seed: input.seed,
    });
    const result = validateFractionAdditionAnswer(task, input.answer);
    return {
      status: "success",
      isCorrect: result.isCorrect,
      isMathematicallyEquivalent: result.isMathematicallyEquivalent,
      reason: result.reason,
    };
  } catch (error) {
    console.error("checkFractionPracticeAnswerAction: unexpected error", error);
    return { status: "error", code: "generic" };
  }
}
