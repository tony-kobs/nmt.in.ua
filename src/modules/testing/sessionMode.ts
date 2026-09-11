import type { TrainerMode } from "./types";

/**
 * Behavioral classification for answer feedback and Practice affordances
 * (hint, similar task, adaptive difficulty) — narrower than `TrainerMode`,
 * which also covers Ultimate and the NMT simulator.
 *
 * - "diagnostic": must stay neutral. No correct/incorrect reveal, no hint,
 *   no adaptive reaction, no similar-task retry — see AGENTS.md.
 * - "practice": the untimed topic test (`TrainerMode: "standard"`, used for
 *   user/auto/mentor sessions alike). Full correct/incorrect feedback plus
 *   hint, similar task, and adaptive difficulty.
 * - "exam": Ultimate and the NMT simulator. Both already suppress per-task
 *   feedback the same way diagnostic does (see `resolveAnswerCardState`),
 *   but they are timed exam simulations, not the diagnostic assessment —
 *   this bucket exists so a future caller can't accidentally wire a Practice
 *   affordance into a timed exam by mistake.
 */
export type SessionMode = "diagnostic" | "practice" | "exam";

export function resolveSessionMode(mode: TrainerMode): SessionMode {
  if (mode === "diagnostic") return "diagnostic";
  if (mode === "standard") return "practice";
  return "exam";
}

/** Whether Practice-only affordances (hint, similar task, adaptive
 * difficulty) may ever appear for this `TrainerMode`. */
export function isPracticeMode(mode: TrainerMode): boolean {
  return resolveSessionMode(mode) === "practice";
}
