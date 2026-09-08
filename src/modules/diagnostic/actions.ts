"use server";

import { revalidatePath } from "next/cache";
import { isValidSelfScore } from "@/modules/self-score/types";
import type {
  CheckAnswerActionState,
  FinishTrainerSessionActionState,
  MarkSessionStartedActionState,
} from "@/modules/testing/types";
import {
  checkDiagnosticAnswer,
  CheckDiagnosticAnswerError,
} from "./checkDiagnosticAnswer";
import {
  finishDiagnosticSession,
  FinishDiagnosticSessionError,
} from "./finishDiagnosticSession";
import {
  markDiagnosticSessionStarted,
  MarkDiagnosticSessionStartedError,
} from "./markDiagnosticSessionStarted";
import { resolveOwnerForWrite } from "./sessionOwner";
import {
  startDiagnosticTest,
  StartDiagnosticTestError,
} from "./startDiagnosticTest";
import {
  getDiagnosticThemeBreakdown,
  toDiagnosticTopicInsight,
  type DiagnosticTopicInsight,
} from "./diagnosticThemeBreakdown";

export type StartDiagnosticActionErrorCode =
  | "invalidSelfScore"
  | "insufficientTasks"
  | "alreadyInProgress"
  | "generic";

export type StartDiagnosticActionState =
  | { status: "idle" }
  | { status: "error"; code: StartDiagnosticActionErrorCode }
  | { status: "success"; sessionId: number; isGuest: boolean };

const INITIAL_STATE: StartDiagnosticActionState = { status: "idle" };

/**
 * One round trip: resolves the caller's identity (authenticated user, or a
 * signed guest cookie minted here if absent), then starts the diagnostic
 * test — which records the general self-assessment and creates the session
 * atomically. Combining these in one action avoids ever minting the guest
 * cookie mid-flow under one identity and creating the session under
 * another.
 */
export async function startDiagnosticAction(
  _prevState: StartDiagnosticActionState = INITIAL_STATE,
  formData: FormData,
): Promise<StartDiagnosticActionState> {
  const rawScore = Number(formData.get("selfScore"));
  const selfScore = isValidSelfScore(rawScore) ? rawScore : null;

  if (selfScore === null) {
    return { status: "error", code: "invalidSelfScore" };
  }

  try {
    const owner = await resolveOwnerForWrite();
    const result = await startDiagnosticTest({ owner, selfScore });
    return {
      status: "success",
      sessionId: result.sessionId,
      isGuest: owner.userId === null,
    };
  } catch (error) {
    if (error instanceof StartDiagnosticTestError) {
      switch (error.code) {
        case "insufficient_tasks":
          return { status: "error", code: "insufficientTasks" };
        case "already_in_progress":
          return { status: "error", code: "alreadyInProgress" };
        case "invalid_input":
          return { status: "error", code: "invalidSelfScore" };
        default:
          return { status: "error", code: "generic" };
      }
    }
    console.error("startDiagnosticAction: unexpected error", error);
    return { status: "error", code: "generic" };
  }
}

export type CheckDiagnosticAnswerActionInput = {
  sessionId: number;
  mappingId: number;
  answerNumber: 1 | 2 | 3 | 4;
};

export async function checkDiagnosticAnswerAction(
  input: CheckDiagnosticAnswerActionInput,
): Promise<CheckAnswerActionState> {
  try {
    const owner = await resolveOwnerForWrite();
    const result = await checkDiagnosticAnswer({
      owner,
      sessionId: input.sessionId,
      mappingId: input.mappingId,
      answerNumber: input.answerNumber,
    });
    return { status: "success", correct: result.correct };
  } catch (error) {
    if (error instanceof CheckDiagnosticAnswerError) {
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
    console.error("checkDiagnosticAnswerAction: unexpected error", error);
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

    return { status: "success", summary, recommendations: [] };
  } catch (error) {
    if (error instanceof FinishDiagnosticSessionError) {
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
    console.error("finishDiagnosticSessionAction: unexpected error", error);
    return { status: "error", code: "generic" };
  }
}

/**
 * Fetched as a follow-up call after a successful finish — same shape as how
 * `getSessionMistakeReviewAction` enriches the Ultimate summary — rather than
 * folded into `FinishTrainerSessionActionState`, so the shared testing/type
 * surface used by standard and Ultimate sessions stays untouched.
 */
export async function getDiagnosticThemeBreakdownAction(
  sessionId: number,
): Promise<DiagnosticTopicInsight> {
  try {
    const owner = await resolveOwnerForWrite();
    const stats = await getDiagnosticThemeBreakdown(sessionId, owner);
    return toDiagnosticTopicInsight(stats);
  } catch (error) {
    console.error("getDiagnosticThemeBreakdownAction: unexpected error", error);
    return { strongest: [], priority: [] };
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
    if (error instanceof MarkDiagnosticSessionStartedError) {
      switch (error.code) {
        case "invalid_input":
          return { status: "error", code: "invalidInput" };
        case "not_found":
          return { status: "error", code: "notFound" };
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
