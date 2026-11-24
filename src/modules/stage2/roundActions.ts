"use server";

import { requireTrainingUserId } from "@/modules/auth/getCurrentUser";
import { rethrowNavigation } from "@/lib/db/unavailable";
import type { Stage2Format } from "./stage2Attempt";
import { startRound, getRound, finishRound, skipRoundTask, startMistakeRound, listRounds, RoundError, type RoundMode, type RoundSnapshot, type RoundSummary } from "./rounds";

type RoundActionResult = { status: "success"; round: RoundSnapshot } | { status: "error"; code: string };
async function act(work: (userId: number) => Promise<RoundSnapshot>): Promise<RoundActionResult> {
  try { return { status: "success", round: await work(await requireTrainingUserId()) }; }
  catch (error) {
    rethrowNavigation(error);
    return { status: "error", code: error instanceof RoundError ? error.code : "generic" };
  }
}
export async function startRoundAction(mode: RoundMode, taskCount?: number): Promise<RoundActionResult> {
  return act((userId) => startRound(userId, mode, undefined, taskCount));
}
export async function getRoundAction(roundId: number): Promise<RoundActionResult> {
  return act((userId) => getRound(userId, roundId));
}
export async function finishRoundAction(roundId: number): Promise<RoundActionResult> {
  return act((userId) => finishRound(userId, roundId));
}
export async function skipRoundTaskAction(roundId: number, format: Stage2Format, taskId: number): Promise<RoundActionResult> {
  return act((userId) => skipRoundTask(userId, roundId, format, taskId));
}
export async function startMistakeRoundAction(sourceRoundId: number): Promise<RoundActionResult> {
  return act((userId) => startMistakeRound(userId, sourceRoundId));
}
export async function listRoundsAction(): Promise<{ status: "success"; rounds: RoundSummary[] } | { status: "error"; code: string }> {
  try { return { status: "success", rounds: await listRounds(await requireTrainingUserId()) }; }
  catch (error) {
    rethrowNavigation(error);
    return { status: "error", code: error instanceof RoundError ? error.code : "generic" };
  }
}
