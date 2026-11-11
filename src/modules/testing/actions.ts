"use server";

import {
  recommendNextActionsForStats,
  recommendFromSessionMistakes,
  persistRecommendations,
  type RecommendationTranslator,
} from "@/modules/recommendations";
import { getStudentTopicStats } from "@/modules/recommendations/getStudentTopicStats";
import {
  requireSessionUserId,
  type requireUserId,
} from "@/modules/auth/getCurrentUser";
import { revalidatePath } from "next/cache";
import {
  checkAnswer,
  CheckAnswerError,
  type CheckAnswerResult,
} from "./checkAnswer";
import {
  finishTrainerSession,
  FinishTrainerSessionError,
} from "./finishTrainerSession";
import {
  markSessionStarted,
  MarkSessionStartedError,
} from "./markSessionStarted";
import { startTopicTest, StartTopicTestError } from "./startTopicTest";
import { parseRequestedTaskCount, type TopicTestMode } from "./topicTestMode";
import { skipTaskAnswer, SkipTaskAnswerError } from "./skipTaskAnswer";
import {
  getSessionMistakeReview,
  type SessionMistakeItem,
} from "./getSessionMistakeReview";
import { getTaskHint, GetTaskHintError } from "./getTaskHint";
import {
  addSimilarPracticeTask,
  AddSimilarPracticeTaskError,
} from "./addSimilarPracticeTask";
import { getTaskHintLevel, GetTaskHintLevelError } from "./getTaskHintLevel";
import {
  startMistakeReviewRound,
  StartMistakeReviewRoundError,
} from "./startMistakeReviewRound";
import {
  addSpacedRepetitionTask,
  AddSpacedRepetitionTaskError,
} from "./addSpacedRepetitionTask";
import type {
  CheckAnswerActionInput,
  CheckAnswerActionState,
  FinishTrainerSessionActionInput,
  FinishTrainerSessionActionState,
  MarkSessionStartedActionInput,
  MarkSessionStartedActionState,
  SkipTaskAnswerActionInput,
  SkipTaskAnswerActionState,
  GetTaskHintActionInput,
  GetTaskHintActionState,
  AddSimilarPracticeTaskActionInput,
  AddSimilarPracticeTaskActionState,
  GetTaskHintLevelActionInput,
  GetTaskHintLevelActionState,
  StartMistakeReviewRoundActionInput,
  StartMistakeReviewRoundActionState,
  AddSpacedRepetitionTaskActionInput,
  AddSpacedRepetitionTaskActionState,
} from "./types";
import { getTranslations } from "next-intl/server";
import { sessionCompletionFollowUp } from "./sessionCompletionFollowUp";

export type StartTopicTestErrorCode =
  | "insufficientTasks"
  | "levelEmpty"
  | "alreadyInProgress"
  | "invalidInput"
  | "invalidTaskCount"
  | "generic";

import { startNmtSimulator, StartNmtSimulatorError } from "./startNmtSimulator";

export type StartTopicTestActionState =
  | { status: "idle" }
  | { status: "error"; code: StartTopicTestErrorCode }
  | { status: "success"; sessionId: number; mode: TopicTestMode };

type AuthDeps = {
  requireUserId: typeof requireUserId;
};

const defaultAuthDeps: AuthDeps = { requireUserId: requireSessionUserId };

async function getRecommendationTranslator(
  locale: "uk" | "en" | "de",
): Promise<RecommendationTranslator> {
  const t = await getTranslations({
    locale,
    namespace: "Recommendations",
  });

  return (key, values) => t(key as never, values as never);
}

type StartTopicTestActionDeps = AuthDeps & {
  startTopicTest: typeof startTopicTest;
};

/**
 * Server Action for "Старт" on the topic-test screen. User id comes from the
 * authenticated session — never from client input.
 */
export async function startTopicTestAction(
  _prevState: StartTopicTestActionState,
  formData: FormData,
  deps: StartTopicTestActionDeps = { startTopicTest, ...defaultAuthDeps },
): Promise<StartTopicTestActionState> {
  const themeId = Number(formData.get("themeId"));
  const taskCount = parseRequestedTaskCount(formData.get("taskCount"));
  const levelId = readOptionalLevelId(formData);

  if (taskCount === null) {
    return { status: "error", code: "invalidTaskCount" };
  }
  if (levelId === "invalid") {
    return { status: "error", code: "invalidInput" };
  }

  try {
    const userId = await deps.requireUserId();
    const result = await deps.startTopicTest({
      userId,
      themeId,
      taskCount,
      mode: "standard",
      ...(levelId != null ? { levelId } : {}),
    });
    return {
      status: "success",
      sessionId: result.sessionId,
      mode: result.mode,
    };
  } catch (error) {
    if (error instanceof StartTopicTestError) {
      switch (error.code) {
        case "insufficient_tasks":
          return { status: "error", code: "insufficientTasks" };

        case "level_empty":
          return { status: "error", code: "levelEmpty" };

        case "already_in_progress":
          return { status: "error", code: "alreadyInProgress" };

        case "invalid_input":
          return { status: "error", code: "invalidInput" };

        default:
          return { status: "error", code: "generic" };
      }
    }

    console.error("startTopicTestAction: unexpected error", error);
    return { status: "error", code: "generic" };
  }
}

/** Empty or missing means the whole theme bank. Anything else must be a positive id. */
function readOptionalLevelId(formData: FormData): number | null | "invalid" {
  const raw = formData.get("levelId");
  if (raw == null) return null;
  const text = String(raw).trim();
  if (text === "" || text === "0") return null;
  const parsed = Number(text);
  if (!Number.isInteger(parsed) || parsed <= 0) return "invalid";
  return parsed;
}

export type StartNmtSimulatorErrorCode =
  | "insufficientTasks"
  | "alreadyInProgress"
  | "variantNotFound"
  | "invalidInput"
  | "generic";

export type StartNmtSimulatorActionState =
  | { status: "idle" }
  | { status: "error"; code: StartNmtSimulatorErrorCode }
  | { status: "success"; sessionId: number };

export async function startNmtSimulatorAction(
  _prevState: StartNmtSimulatorActionState,
  formData: FormData,
): Promise<StartNmtSimulatorActionState> {
  try {
    const userId = await requireSessionUserId();
    const rawVariant = String(formData.get("variantId") ?? "random");
    const variantId =
      rawVariant === "random" ? ("random" as const) : Number(rawVariant);

    const result = await startNmtSimulator(userId, variantId);

    return {
      status: "success",
      sessionId: result.sessionId,
    };
  } catch (error) {
    if (error instanceof StartNmtSimulatorError) {
      switch (error.code) {
        case "insufficient_tasks":
          return { status: "error", code: "insufficientTasks" };
        case "already_in_progress":
          return { status: "error", code: "alreadyInProgress" };
        case "variant_not_found":
          return { status: "error", code: "variantNotFound" };
        case "invalid_input":
          return { status: "error", code: "invalidInput" };
        default:
          return { status: "error", code: "generic" };
      }
    }

    console.error("startNmtSimulatorAction: unexpected error", error);
    return { status: "error", code: "generic" };
  }
}

export type {
  CheckAnswerActionInput,
  CheckAnswerActionState,
  FinishTrainerSessionActionInput,
  FinishTrainerSessionActionState,
  MarkSessionStartedActionInput,
  MarkSessionStartedActionState,
  SkipTaskAnswerActionInput,
  SkipTaskAnswerActionState,
};

type CheckAnswerActionDeps = AuthDeps & {
  checkAnswer: typeof checkAnswer;
};

/**
 * Server Action for a chosen option in TopicTrainer. User id is trusted
 * server-side. The payload never includes `right_answer_n`.
 */
export async function checkAnswerAction(
  input: CheckAnswerActionInput,
  deps: CheckAnswerActionDeps = { checkAnswer, ...defaultAuthDeps },
): Promise<CheckAnswerActionState> {
  try {
    const userId = await deps.requireUserId();
    const result: CheckAnswerResult = await deps.checkAnswer({
      userId,
      sessionId: input.sessionId,
      mappingId: input.mappingId,
      ...(input.attempt !== undefined ? { attempt: input.attempt } : {}),
      ...(input.answerNumber !== undefined
        ? { answerNumber: input.answerNumber }
        : {}),
      ...(input.answerText !== undefined
        ? { answerText: input.answerText }
        : {}),
    });
    return {
      status: "success",
      correct: result.correct,
      firstAttempt: result.firstAttempt,
      ...(result.retryAvailable ? { retryAvailable: result.retryAvailable } : {}),
      ...(result.revealed ? { revealed: result.revealed } : {}),
    };
  } catch (error) {
    if (error instanceof CheckAnswerError) {
      switch (error.code) {
        case "invalid_input":
          return { status: "error", code: "invalidInput" };

        case "not_found":
          return { status: "error", code: "notFound" };

        case "session_completed":
          return { status: "error", code: "sessionCompleted" };

        case "session_expired":
          return { status: "error", code: "sessionExpired" };

        case "time_up":
          return { status: "error", code: "timeUp" };

        default:
          return { status: "error", code: "generic" };
      }
    }

    console.error("checkAnswerAction: unexpected error", error);
    return { status: "error", code: "generic" };
  }
}

type FinishTrainerSessionActionDeps = AuthDeps & {
  finishTrainerSession: typeof finishTrainerSession;
  getStudentTopicStats: typeof getStudentTopicStats;
  recommendNextActionsForStats: typeof recommendNextActionsForStats;
  recommendFromSessionMistakes: typeof recommendFromSessionMistakes;
  getSessionMistakeReview: typeof getSessionMistakeReview;
  persistRecommendations: typeof persistRecommendations;
  getRecommendationTranslator?: (
    locale: "uk" | "en" | "de",
  ) => Promise<RecommendationTranslator>;
};

const defaultFinishDeps: FinishTrainerSessionActionDeps = {
  finishTrainerSession,
  getStudentTopicStats,
  recommendNextActionsForStats,
  recommendFromSessionMistakes,
  getSessionMistakeReview,
  persistRecommendations,
  getRecommendationTranslator,
  ...defaultAuthDeps,
};

/**
 * Server Action for "Завершити тест". Re-finishing a completed session returns
 * the same summary.
 */
export async function finishTrainerSessionAction(
  input: FinishTrainerSessionActionInput,
  deps: FinishTrainerSessionActionDeps = defaultFinishDeps,
): Promise<FinishTrainerSessionActionState> {
  try {
    const userId = await deps.requireUserId();
    const summary = await deps.finishTrainerSession({
      userId,
      sessionId: input.sessionId,
      markUnansweredAsIncorrect: input.markUnansweredAsIncorrect,
      capTimeSec: input.capTimeSec,
    });

    const locale =
      input.locale === "en" || input.locale === "de" || input.locale === "uk"
        ? input.locale
        : "uk";

    const { recommendations, insight } = await sessionCompletionFollowUp(userId, summary, locale, deps);

    return { status: "success", summary, recommendations, insight };
  } catch (error) {
    if (error instanceof FinishTrainerSessionError) {
      switch (error.code) {
        case "invalid_input":
          return { status: "error", code: "invalidInput" };

        case "not_found":
          return { status: "error", code: "notFound" };

        case "unfinished":
          return { status: "error", code: "unfinished" };

        case "session_expired":
          return { status: "error", code: "sessionExpired" };

        default:
          return { status: "error", code: "generic" };
      }
    }

    console.error("finishTrainerSessionAction: unexpected error", error);
    return { status: "error", code: "generic" };
  }
}

type MarkSessionStartedActionDeps = AuthDeps & {
  markSessionStarted: typeof markSessionStarted;
};

export async function markSessionStartedAction(
  input: MarkSessionStartedActionInput,
  deps: MarkSessionStartedActionDeps = {
    markSessionStarted,
    ...defaultAuthDeps,
  },
): Promise<MarkSessionStartedActionState> {
  try {
    const userId = await deps.requireUserId();
    const result = await deps.markSessionStarted({
      userId,
      sessionId: input.sessionId,
    });
    return { status: "success", startTime: result.startTime };
  } catch (error) {
    if (error instanceof MarkSessionStartedError) {
      switch (error.code) {
        case "invalid_input":
          return { status: "error", code: "invalidInput" };

        case "not_found":
          return { status: "error", code: "notFound" };

        case "session_expired":
          return { status: "error", code: "sessionExpired" };

        default:
          return { status: "error", code: "generic" };
      }
    }

    console.error("markSessionStartedAction: unexpected error", error);
    return { status: "error", code: "generic" };
  }
}

type SkipTaskAnswerActionDeps = AuthDeps & {
  skipTaskAnswer: typeof skipTaskAnswer;
};

export async function skipTaskAnswerAction(
  input: SkipTaskAnswerActionInput,
  deps: SkipTaskAnswerActionDeps = { skipTaskAnswer, ...defaultAuthDeps },
): Promise<SkipTaskAnswerActionState> {
  try {
    const userId = await deps.requireUserId();
    await deps.skipTaskAnswer({
      userId,
      sessionId: input.sessionId,
      mappingId: input.mappingId,
    });
    return { status: "success", correct: false };
  } catch (error) {
    if (error instanceof SkipTaskAnswerError) {
      switch (error.code) {
        case "not_found":
          return { status: "error", code: "notFound" };

        case "session_completed":
          return { status: "error", code: "sessionCompleted" };

        case "session_expired":
          return { status: "error", code: "sessionExpired" };

        default:
          return { status: "error", code: "generic" };
      }
    }

    console.error("skipTaskAnswerAction: unexpected error", error);
    return { status: "error", code: "generic" };
  }
}

export async function getSessionMistakeReviewAction(
  sessionId: number,
): Promise<SessionMistakeItem[]> {
  const userId = await requireSessionUserId();
  return getSessionMistakeReview(sessionId, userId);
}

type GetTaskHintActionDeps = AuthDeps & {
  getTaskHint: typeof getTaskHint;
};

/**
 * Server Action for Practice mode's "Show hint". `getTaskHint` itself
 * re-checks eligibility (topic test, already answered incorrectly, not
 * diagnostic/NMT) — this wrapper only translates errors, same as every
 * other action here.
 */
export async function getTaskHintAction(
  input: GetTaskHintActionInput,
  deps: GetTaskHintActionDeps = { getTaskHint, ...defaultAuthDeps },
): Promise<GetTaskHintActionState> {
  try {
    const userId = await deps.requireUserId();
    const result = await deps.getTaskHint({
      userId,
      sessionId: input.sessionId,
      mappingId: input.mappingId,
    });
    return { status: "success", available: result.available, hint: result.hint };
  } catch (error) {
    if (error instanceof GetTaskHintError) {
      switch (error.code) {
        case "invalid_input":
          return { status: "error", code: "invalidInput" };
        case "not_found":
          return { status: "error", code: "notFound" };
        case "session_expired":
          return { status: "error", code: "sessionExpired" };
        default:
          return { status: "error", code: "generic" };
      }
    }

    console.error("getTaskHintAction: unexpected error", error);
    return { status: "error", code: "generic" };
  }
}

type AddSimilarPracticeTaskActionDeps = AuthDeps & {
  addSimilarPracticeTask: typeof addSimilarPracticeTask;
};

/**
 * Server Action for Practice mode's "Try a similar task". Appends a new
 * `tasks2session` row to the same session — see `addSimilarPracticeTask.ts`
 * for why that keeps the existing score/finish logic working unchanged.
 */
export async function addSimilarPracticeTaskAction(
  input: AddSimilarPracticeTaskActionInput,
  deps: AddSimilarPracticeTaskActionDeps = {
    addSimilarPracticeTask,
    ...defaultAuthDeps,
  },
): Promise<AddSimilarPracticeTaskActionState> {
  try {
    const userId = await deps.requireUserId();
    const result = await deps.addSimilarPracticeTask({
      userId,
      sessionId: input.sessionId,
      mappingId: input.mappingId,
    });
    return { status: "success", mappingId: result.mappingId, task: result.task };
  } catch (error) {
    if (error instanceof AddSimilarPracticeTaskError) {
      switch (error.code) {
        case "invalid_input":
          return { status: "error", code: "invalidInput" };
        case "not_found":
          return { status: "error", code: "notFound" };
        case "not_eligible":
          return { status: "error", code: "notEligible" };
        case "not_incorrect":
          return { status: "error", code: "notIncorrect" };
        case "retry_pending":
          return { status: "error", code: "retryPending" };
        case "no_similar_task":
          return { status: "error", code: "noSimilarTask" };
        case "session_expired":
          return { status: "error", code: "sessionExpired" };
        default:
          return { status: "error", code: "generic" };
      }
    }

    console.error("addSimilarPracticeTaskAction: unexpected error", error);
    return { status: "error", code: "generic" };
  }
}

type GetTaskHintLevelActionDeps = AuthDeps & {
  getTaskHintLevel: typeof getTaskHintLevel;
};

/**
 * Server Action for the Practice-mode 3-rung hint ladder. Each rung must be
 * requested explicitly (never sends the next rung ahead of the one asked
 * for) — see `getTaskHintLevel.ts` for the server-enforced sequential ratchet.
 */
export async function getTaskHintLevelAction(
  input: GetTaskHintLevelActionInput,
  deps: GetTaskHintLevelActionDeps = { getTaskHintLevel, ...defaultAuthDeps },
): Promise<GetTaskHintLevelActionState> {
  try {
    const userId = await deps.requireUserId();
    const result = await deps.getTaskHintLevel({
      userId,
      sessionId: input.sessionId,
      mappingId: input.mappingId,
      level: input.level,
    });
    return {
      status: "success",
      available: result.available,
      level: result.level,
      text: result.text,
      isFinal: result.isFinal,
    };
  } catch (error) {
    if (error instanceof GetTaskHintLevelError) {
      switch (error.code) {
        case "invalid_input":
          return { status: "error", code: "invalidInput" };
        case "not_found":
          return { status: "error", code: "notFound" };
        case "not_eligible":
          return { status: "error", code: "notEligible" };
        case "session_expired":
          return { status: "error", code: "sessionExpired" };
        default:
          return { status: "error", code: "generic" };
      }
    }

    console.error("getTaskHintLevelAction: unexpected error", error);
    return { status: "error", code: "generic" };
  }
}

type StartMistakeReviewRoundActionDeps = AuthDeps & {
  startMistakeReviewRound: typeof startMistakeReviewRound;
};

/**
 * Server Action for "Work on mistakes" — starts a brand-new topic-test
 * session containing the wrong/skipped tasks of an already-completed
 * session. Never mutates the original session's stored summary.
 */
export async function startMistakeReviewRoundAction(
  input: StartMistakeReviewRoundActionInput,
  deps: StartMistakeReviewRoundActionDeps = {
    startMistakeReviewRound,
    ...defaultAuthDeps,
  },
): Promise<StartMistakeReviewRoundActionState> {
  try {
    const userId = await deps.requireUserId();
    const result = await deps.startMistakeReviewRound({
      userId,
      sessionId: input.sessionId,
    });
    return { status: "success", sessionId: result.sessionId };
  } catch (error) {
    if (error instanceof StartMistakeReviewRoundError) {
      switch (error.code) {
        case "invalid_input":
          return { status: "error", code: "invalidInput" };
        case "not_found":
          return { status: "error", code: "notFound" };
        case "not_completed":
          return { status: "error", code: "notCompleted" };
        case "no_mistakes":
          return { status: "error", code: "noMistakes" };
        default:
          return { status: "error", code: "generic" };
      }
    }

    console.error("startMistakeReviewRoundAction: unexpected error", error);
    return { status: "error", code: "generic" };
  }
}

type AddSpacedRepetitionTaskActionDeps = AuthDeps & {
  addSpacedRepetitionTask: typeof addSpacedRepetitionTask;
};

/**
 * Server Action checked opportunistically after an answer to see whether a
 * theme is due for spaced repetition. `{ added: false }` is a normal result
 * (nothing due, or no candidate task), not an error.
 */
export async function addSpacedRepetitionTaskAction(
  input: AddSpacedRepetitionTaskActionInput,
  deps: AddSpacedRepetitionTaskActionDeps = {
    addSpacedRepetitionTask,
    ...defaultAuthDeps,
  },
): Promise<AddSpacedRepetitionTaskActionState> {
  try {
    const userId = await deps.requireUserId();
    const result = await deps.addSpacedRepetitionTask({
      userId,
      sessionId: input.sessionId,
    });
    return result.added
      ? { status: "success", added: true, mappingId: result.mappingId, task: result.task }
      : { status: "success", added: false };
  } catch (error) {
    if (error instanceof AddSpacedRepetitionTaskError) {
      switch (error.code) {
        case "invalid_input":
          return { status: "error", code: "invalidInput" };
        case "not_found":
          return { status: "error", code: "notFound" };
        case "not_eligible":
          return { status: "error", code: "notEligible" };
        case "session_expired":
          return { status: "error", code: "sessionExpired" };
        default:
          return { status: "error", code: "generic" };
      }
    }

    console.error("addSpacedRepetitionTaskAction: unexpected error", error);
    return { status: "error", code: "generic" };
  }
}
