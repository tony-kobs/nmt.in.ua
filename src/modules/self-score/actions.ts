"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/modules/auth/getCurrentUser";
import {
  recordSelfScore,
  RecordSelfScoreError,
} from "@/modules/self-score";

export type SaveThemeSelfScoreInput = {
  themeId: number;
  score: number;
};

export type SaveThemeSelfScoreState =
  | { status: "success"; score: number }
  | { status: "error"; code: SaveThemeSelfScoreErrorCode };

export type SaveThemeSelfScoreErrorCode =
  | "invalid_input"
  | "unauthorized"
  | "generic";

type SaveThemeSelfScoreDeps = {
  requireUserId: typeof requireUserId;
  recordSelfScore: typeof recordSelfScore;
  revalidatePath: typeof revalidatePath;
};

const RESULTS_SELF_SCORE_MIN = 1;
const RESULTS_SELF_SCORE_MAX = 5;

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isResultsSelfScore(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= RESULTS_SELF_SCORE_MIN &&
    value <= RESULTS_SELF_SCORE_MAX
  );
}

/**
 * Appends a per-theme self-score from `/results` (scale 1–5). History is
 * append-only — the results table shows the latest `pre_topic` (else diagnostic).
 */
export async function saveThemeSelfScoreAction(
  input: SaveThemeSelfScoreInput,
  deps: SaveThemeSelfScoreDeps = {
    requireUserId,
    recordSelfScore,
    revalidatePath,
  },
): Promise<SaveThemeSelfScoreState> {
  if (!isPositiveInt(input.themeId) || !isResultsSelfScore(input.score)) {
    return { status: "error", code: "invalid_input" };
  }

  let userId: number;
  try {
    userId = await deps.requireUserId();
  } catch {
    return { status: "error", code: "unauthorized" };
  }

  try {
    await deps.recordSelfScore({
      userId,
      guestToken: null,
      themeId: input.themeId,
      score: input.score,
      source: "pre_topic",
    });
    deps.revalidatePath("/results");
    return { status: "success", score: input.score };
  } catch (error) {
    if (error instanceof RecordSelfScoreError) {
      if (error.code === "invalid_input") {
        return { status: "error", code: "invalid_input" };
      }
    }
    console.error("saveThemeSelfScoreAction failed", error);
    return { status: "error", code: "generic" };
  }
}
