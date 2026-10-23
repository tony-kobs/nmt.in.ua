"use server";

import { revalidatePath } from "next/cache";

function rethrowNavigation(error: unknown): void {
  if (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    typeof (error as { digest: unknown }).digest === "string" &&
    (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  ) {
    throw error;
  }
}
import type {
  CheckAnswerActionInput,
  CheckAnswerActionState,
  FinishTrainerSessionActionState,
  MarkSessionStartedActionState,
  SessionTask,
  TrainerSessionSummary,
} from "@/modules/testing/types";
import { TASK_STATUS_UNANSWERED } from "@/modules/testing/types";
import {
  checkDiagnosticAnswer,
  CheckDiagnosticAnswerError,
  skipDiagnosticTask,
} from "./checkDiagnosticAnswer";
import {
  finishDiagnosticSession,
  FinishDiagnosticSessionError,
} from "./finishDiagnosticSession";
import {
  markDiagnosticSessionStarted,
  MarkDiagnosticSessionStartedError,
} from "./markDiagnosticSessionStarted";
import { resolveOwnerForRead, resolveOwnerForWrite } from "./sessionOwner";
import {
  startDiagnosticTest,
  StartDiagnosticTestError,
} from "./startDiagnosticTest";
import {
  advanceDiagnosticSession,
  AdvanceDiagnosticSessionError,
} from "./advanceDiagnosticSession";
import {
  getDiagnosticThemeBreakdown,
  toDiagnosticTopicInsight,
  type DiagnosticTopicInsight,
} from "./diagnosticThemeBreakdown";
import {
  getDiagnosticAnswerReview,
  type DiagnosticAnswerReviewItem,
} from "./getDiagnosticAnswerReview";
import {
  getDiagnosticSessionTasks,
  GetDiagnosticSessionTasksError,
} from "./getDiagnosticSessionTasks";
import { getDiagnosticNextStep } from "./getDiagnosticNextStep";
import { DIAGNOSTIC_TOTAL_QUESTIONS } from "./diagnosticProgress";

export type StartDiagnosticActionErrorCode =
  | "insufficientTasks"
  | "alreadyInProgress"
  | "generic";

export type StartDiagnosticActionState =
  | { status: "idle" }
  | { status: "error"; code: StartDiagnosticActionErrorCode }
  | { status: "success"; sessionId: number; isGuest: boolean };

const INITIAL_STATE: StartDiagnosticActionState = { status: "idle" };

/**
 * Resolves identity (user or minted guest cookie) and starts the adaptive
 * intro test. No self-assessment — difficulty adapts from answers only.
 */
export async function startDiagnosticAction(
  _prevState: StartDiagnosticActionState = INITIAL_STATE,
  _formData?: FormData,
): Promise<StartDiagnosticActionState> {
  try {
    const owner = await resolveOwnerForWrite();
    const result = await startDiagnosticTest({ owner });
    return {
      status: "success",
      sessionId: result.sessionId,
      isGuest: owner.userId === null,
    };
  } catch (error) {
    rethrowNavigation(error);
    if (error instanceof StartDiagnosticTestError) {
      switch (error.code) {
        case "insufficient_tasks":
          return { status: "error", code: "insufficientTasks" };
        case "already_in_progress":
          return { status: "error", code: "alreadyInProgress" };
        default:
          return { status: "error", code: "generic" };
      }
    }
    console.error("startDiagnosticAction: unexpected error", error);
    return { status: "error", code: "generic" };
  }
}

export type AdvanceDiagnosticActionState =
  | { status: "success"; next: "task" | "complete" }
  | { status: "error"; code: "notFound" | "sessionExpired" | "generic" };

export async function advanceDiagnosticAction(input: {
  sessionId: number;
}): Promise<AdvanceDiagnosticActionState> {
  try {
    const owner = await resolveOwnerForWrite();
    const result = await advanceDiagnosticSession({
      owner,
      sessionId: input.sessionId,
    });
    return { status: "success", next: result.next };
  } catch (error) {
    rethrowNavigation(error);
    if (error instanceof AdvanceDiagnosticSessionError) {
      switch (error.code) {
        case "invalid_input":
        case "not_found":
          return { status: "error", code: "notFound" };
        case "session_expired":
          return { status: "error", code: "sessionExpired" };
        default:
          return { status: "error", code: "generic" };
      }
    }
    console.error("advanceDiagnosticAction: unexpected error", error);
    return { status: "error", code: "generic" };
  }
}

export type CheckDiagnosticAnswerActionInput = CheckAnswerActionInput;

export async function checkDiagnosticAnswerAction(
  input: CheckDiagnosticAnswerActionInput,
): Promise<CheckAnswerActionState> {
  try {
    if (input.answerNumber == null) {
      return { status: "error", code: "invalidInput" };
    }
    const owner = await resolveOwnerForWrite();
    const result = await checkDiagnosticAnswer({
      owner,
      sessionId: input.sessionId,
      mappingId: input.mappingId,
      answerNumber: input.answerNumber,
    });
    return { status: "success", correct: result.correct, firstAttempt: true };
  } catch (error) {
    rethrowNavigation(error);
    if (error instanceof CheckDiagnosticAnswerError) {
      switch (error.code) {
        case "invalid_input":
          return { status: "error", code: "invalidInput" };
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
    console.error("checkDiagnosticAnswerAction: unexpected error", error);
    return { status: "error", code: "generic" };
  }
}

export async function skipDiagnosticTaskAction(input: {
  sessionId: number;
  mappingId: number;
}): Promise<CheckAnswerActionState> {
  try {
    const owner = await resolveOwnerForWrite();
    await skipDiagnosticTask({
      owner,
      sessionId: input.sessionId,
      mappingId: input.mappingId,
    });
    return { status: "success", correct: false, firstAttempt: true };
  } catch (error) {
    rethrowNavigation(error);
    if (error instanceof CheckDiagnosticAnswerError) {
      switch (error.code) {
        case "invalid_input":
          return { status: "error", code: "invalidInput" };
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
    console.error("skipDiagnosticTaskAction: unexpected error", error);
    return { status: "error", code: "generic" };
  }
}

export type FinishDiagnosticSessionActionInput = { sessionId: number };

export async function finishDiagnosticSessionAction(
  input: FinishDiagnosticSessionActionInput,
): Promise<FinishTrainerSessionActionState> {
  try {
    const owner = await resolveOwnerForWrite();
    const summary = await finishDiagnosticSession({
      owner,
      sessionId: input.sessionId,
    });

    try {
      revalidatePath("/results");
    } catch {
      // No-op outside a Next.js request context (unit tests).
    }

    return {
      status: "success",
      summary,
      recommendations: [],
      insight: {
        correctCount: summary.rightNumber,
        totalCount: summary.tasksNumber,
        percent: summary.percent,
        strongThemes: [],
        weakThemes: [],
        hasRepeatedMistakes: false,
      },
    };
  } catch (error) {
    rethrowNavigation(error);
    if (error instanceof FinishDiagnosticSessionError) {
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
    console.error("finishDiagnosticSessionAction: unexpected error", error);
    return { status: "error", code: "generic" };
  }
}

export async function getDiagnosticThemeBreakdownAction(
  sessionId: number,
): Promise<DiagnosticTopicInsight> {
  try {
    const owner = await resolveOwnerForWrite();
    const stats = await getDiagnosticThemeBreakdown(sessionId, owner);
    return toDiagnosticTopicInsight(stats);
  } catch (error) {
    rethrowNavigation(error);
    console.error("getDiagnosticThemeBreakdownAction: unexpected error", error);
    return { strongest: [], priority: [] };
  }
}

export async function getDiagnosticAnswerReviewAction(
  sessionId: number,
): Promise<DiagnosticAnswerReviewItem[]> {
  try {
    const owner = await resolveOwnerForRead();
    if (!owner) return [];
    return await getDiagnosticAnswerReview(sessionId, owner);
  } catch (error) {
    rethrowNavigation(error);
    console.error("getDiagnosticAnswerReviewAction: unexpected error", error);
    return [];
  }
}

export type MarkDiagnosticSessionStartedActionInput = { sessionId: number };

export async function markDiagnosticSessionStartedAction(
  input: MarkDiagnosticSessionStartedActionInput,
): Promise<MarkSessionStartedActionState> {
  try {
    const owner = await resolveOwnerForWrite();
    const result = await markDiagnosticSessionStarted({
      owner,
      sessionId: input.sessionId,
    });
    return { status: "success", startTime: result.startTime };
  } catch (error) {
    rethrowNavigation(error);
    if (error instanceof MarkDiagnosticSessionStartedError) {
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
    console.error(
      "markDiagnosticSessionStartedAction: unexpected error",
      error,
    );
    return { status: "error", code: "generic" };
  }
}

export type DiagnosticBoard = {
  themeCode: string | null;
  themeName: string;
  tasks: SessionTask[];
  initialIndex: number;
  progressTotal: number;
  continueAfterLast: boolean;
  summary: TrainerSessionSummary | null;
};

export type LoadDiagnosticBoardActionState =
  | { status: "success"; board: DiagnosticBoard }
  | { status: "error"; code: "notFound" | "sessionExpired" | "generic" };

/** Reads the attempt so the intro page can show the cards in place. */
export async function loadDiagnosticBoardAction(
  sessionId: number,
): Promise<LoadDiagnosticBoardActionState> {
  try {
    const owner = await resolveOwnerForRead();
    if (!owner) return { status: "error", code: "notFound" };

    const session = await getDiagnosticSessionTasks(sessionId, owner);
    if (session.tasks.length === 0) return { status: "error", code: "generic" };

    const step = session.summary
      ? null
      : await getDiagnosticNextStep(sessionId, owner);
    const pendingIndex = session.tasks.findIndex(
      (task) => task.status === TASK_STATUS_UNANSWERED,
    );

    return {
      status: "success",
      board: {
        themeCode: session.themeCode,
        themeName: session.themeName,
        tasks: session.tasks,
        initialIndex:
          pendingIndex === -1 ? session.tasks.length - 1 : pendingIndex,
        progressTotal: Math.max(DIAGNOSTIC_TOTAL_QUESTIONS, session.tasks.length),
        continueAfterLast: step?.afterLastTask === "continue",
        summary: session.summary,
      },
    };
  } catch (error) {
    rethrowNavigation(error);
    if (error instanceof GetDiagnosticSessionTasksError) {
      if (error.code === "session_expired") {
        return { status: "error", code: "sessionExpired" };
      }
      if (error.code === "session_not_found" || error.code === "invalid_input") {
        return { status: "error", code: "notFound" };
      }
    }
    console.error("loadDiagnosticBoardAction: unexpected error", error);
    return { status: "error", code: "generic" };
  }
}
