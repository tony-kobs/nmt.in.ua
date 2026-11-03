import type { RevealedAnswerAction } from "@/modules/testing/types";
import { TASK_STATUS_CORRECT, TASK_STATUS_INCORRECT } from "@/modules/testing/types";

export type RestoredCheck = {
  correct: boolean;
  retryAvailable?: boolean;
  revealed?: RevealedAnswerAction;
};

type RestorableTask = {
  mappingId: number;
  status: number;
  retryAvailable?: boolean;
  revealed?: RevealedAnswerAction;
};

/** Answers already stored on the session, so a reload does not look unanswered. */
export function initialAnswerResults(
  tasks: readonly RestorableTask[],
): Record<number, RestoredCheck> {
  const results: Record<number, RestoredCheck> = {};
  for (const task of tasks) {
    if (task.status === TASK_STATUS_CORRECT) {
      results[task.mappingId] = { correct: true };
    }
    if (task.status === TASK_STATUS_INCORRECT) {
      results[task.mappingId] = {
        correct: false,
        retryAvailable: task.retryAvailable,
        revealed: task.revealed,
      };
    }
  }
  return results;
}

/** Opening index stays on a real task. */
export function clampTaskIndex(index: number, length: number): number {
  return Math.min(Math.max(index, 0), Math.max(length - 1, 0));
}
