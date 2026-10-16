import { evaluateDayAccess } from "./calendar";
import { isDayPassed, scorePercent } from "./score";
import type { ProgressMark } from "./streak";
import { streakAfterSubmission } from "./streak";

export type DayGate =
  | { ok: true }
  | { ok: false; code: "invalid_day" | "locked" | "materials_required" };

export function gateDay(input: {
  now: Date;
  startDate: string;
  unlockHour: string;
  daysCount: number;
  dayNumber: number;
  materialsViewed: boolean;
}): DayGate {
  const access = evaluateDayAccess(input);
  if (!access.open) return { ok: false, code: access.code };
  if (!input.materialsViewed) return { ok: false, code: "materials_required" };
  return { ok: true };
}

export type SubmitSuccess = {
  ok: true;
  score: number;
  passed: boolean;
  streak: number;
  completedAt: number;
};

/**
 * Grades an opened day. `now` comes from the server deps.
 * `clientNow` is accepted only so a forged field cannot be confused with the clock.
 */
export async function submitOpenedDay(
  input: {
    startDate: string;
    unlockHour: string;
    daysCount: number;
    dayNumber: number;
    materialsViewed: boolean;
    passThreshold: number;
    progress: ProgressMark[];
    clientNow?: number;
  },
  deps: {
    now: () => Date;
    grade: () => { correct: number; total: number };
    persist: (result: SubmitSuccess) => Promise<void>;
  },
): Promise<SubmitSuccess | Extract<DayGate, { ok: false }>> {
  void input.clientNow;
  const now = deps.now();
  const gate = gateDay({ ...input, now });
  if (!gate.ok) return gate;
  const graded = deps.grade();
  const score = scorePercent(graded.correct, graded.total);
  const passed = isDayPassed(score, input.passThreshold, graded.total);
  const completedAt = now.getTime();
  const streak = streakAfterSubmission({
    ...input,
    passed,
    completedAt,
    now: completedAt,
  });
  const result: SubmitSuccess = { ok: true, score, passed, streak, completedAt };
  await deps.persist(result);
  return result;
}
