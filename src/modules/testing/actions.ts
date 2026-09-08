"use server";

import {
  recommendNextActionsForStats,
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
import type {
  CheckAnswerActionInput,
  CheckAnswerActionState,
  FinishTrainerSessionActionInput,
  FinishTrainerSessionActionState,
  MarkSessionStartedActionInput,
  MarkSessionStartedActionState,
  SkipTaskAnswerActionInput,
  SkipTaskAnswerActionState,
} from "./types";
import { getTranslations } from "next-intl/server";

export type StartTopicTestErrorCode =
  | "insufficientTasks"
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

  if (taskCount === null) {
    return { status: "error", code: "invalidTaskCount" };
  }

  try {
    const userId = await deps.requireUserId();
    const result = await deps.startTopicTest({
      userId,
      themeId,
      taskCount,
      mode: "standard",
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

export type StartNmtSimulatorErrorCode =
  | "insufficientTasks"
  | "alreadyInProgress"
  | "generic";

export type StartNmtSimulatorActionState =
  | { status: "idle" }
  | { status: "error"; code: StartNmtSimulatorErrorCode }
  | { status: "success"; sessionId: number };

export async function startNmtSimulatorAction(
  _prevState: StartNmtSimulatorActionState,
  _formData: FormData,
): Promise<StartNmtSimulatorActionState> {
  try {
    const userId = await requireSessionUserId();

    const result = await startNmtSimulator(userId);

    return {
      status: "success",
      sessionId: result.sessionId,
    };
  } catch (error) {
    if (error instanceof StartNmtSimulatorError) {
      switch (error.code) {
        case "insufficient_tasks":
          return {
            status: "error",
            code: "insufficientTasks",
          };

        case "already_in_progress":
          return {
            status: "error",
            code: "alreadyInProgress",
          };

        default:
          return {
            status: "error",
            code: "generic",
          };
      }
    }

    console.error("startNmtSimulatorAction: unexpected error", error);

    return {
      status: "error",
      code: "generic",
    };
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
      answerNumber: input.answerNumber,
    });
    return { status: "success", correct: result.correct };
  } catch (error) {
    if (error instanceof CheckAnswerError) {
      switch (error.code) {
        case "invalid_input":
          return { status: "error", code: "invalidInput" };

        case "not_found":
          return { status: "error", code: "notFound" };

        case "session_completed":
          return { status: "error", code: "sessionCompleted" };

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
  persistRecommendations: typeof persistRecommendations;
  getRecommendationTranslator?: (
    locale: "uk" | "en" | "de",
  ) => Promise<RecommendationTranslator>;
};

const defaultFinishDeps: FinishTrainerSessionActionDeps = {
  finishTrainerSession,
  getStudentTopicStats,
  recommendNextActionsForStats,
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

    const stats = await deps.getStudentTopicStats(userId);

    const locale =
      input.locale === "en" || input.locale === "de" || input.locale === "uk"
        ? input.locale
        : "uk";

    const translatorFactory =
      deps.getRecommendationTranslator ?? getRecommendationTranslator;

    const t = await translatorFactory(locale);

    const rawActions = await deps.recommendNextActionsForStats(stats, t);
    const { actions: recommendations } = await deps.persistRecommendations(
      userId,
      rawActions,
    );

    try {
      revalidatePath("/results");
      revalidatePath("/sessions");
      revalidatePath("/");
    } catch {
      // No-op outside a Next.js request context (unit tests).
    }

    return { status: "success", summary, recommendations };
  } catch (error) {
    if (error instanceof FinishTrainerSessionError) {
      switch (error.code) {
        case "invalid_input":
          return { status: "error", code: "invalidInput" };

        case "not_found":
          return { status: "error", code: "notFound" };

        case "unfinished":
          return { status: "error", code: "unfinished" };

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
