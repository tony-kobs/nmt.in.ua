"use server";

import { getCurrentUser } from "@/modules/auth/getCurrentUser";
import {
  submitFeedback,
  SubmitFeedbackError,
} from "./submitFeedback";
import {
  isFeedbackScore,
  isFeedbackSource,
  type FeedbackScore,
  type FeedbackSource,
} from "./types";

export type SubmitFeedbackActionInput = {
  score: number;
  message: string;
  email?: string;
  source: FeedbackSource;
  sessionId?: number;
};

export type SubmitFeedbackActionState =
  | { status: "success" }
  | { status: "error"; code: SubmitFeedbackActionErrorCode };

export type SubmitFeedbackActionErrorCode =
  | "invalid_input"
  | "message_required"
  | "invalid_email"
  | "generic";

type SubmitFeedbackActionDeps = {
  getCurrentUser: typeof getCurrentUser;
  submitFeedback: typeof submitFeedback;
};

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/**
 * Stores site feedback. User id comes from the session; guests send
 * `user_id = NULL` and an optional email.
 */
export async function submitFeedbackAction(
  input: SubmitFeedbackActionInput,
  deps: SubmitFeedbackActionDeps = {
    getCurrentUser,
    submitFeedback,
  },
): Promise<SubmitFeedbackActionState> {
  const user = await deps.getCurrentUser();

  if (!isFeedbackScore(input.score) || !isFeedbackSource(input.source)) {
    return { status: "error", code: "invalid_input" };
  }

  const score: FeedbackScore = input.score;
  const sessionId =
    input.source === "post_test" && isPositiveInt(input.sessionId)
      ? input.sessionId
      : null;

  try {
    await deps.submitFeedback({
      userId: user?.id ?? null,
      sessionId,
      score,
      message: input.message,
      email: user ? null : input.email,
      source: input.source,
    });
    return { status: "success" };
  } catch (error) {
    if (error instanceof SubmitFeedbackError) {
      if (
        error.code === "invalid_input" ||
        error.code === "message_required" ||
        error.code === "invalid_email"
      ) {
        return { status: "error", code: error.code };
      }
    }
    console.error("submitFeedbackAction: unexpected error", error);
    return { status: "error", code: "generic" };
  }
}
