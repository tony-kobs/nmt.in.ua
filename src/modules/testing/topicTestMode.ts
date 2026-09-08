/** Default suggested count on the topic-test start form. */
export const TOPIC_TEST_TASK_COUNT = 10;

/** Hard cap for the SQL LIMIT (inlined integer — never bind a user value). */
export const MAX_TOPIC_TEST_TASKS = 200;

/** Ultimate mode — up to 20 random tasks, countdown, review at the end. */
export const ULTIMATE_TASK_LIMIT = 20;
export const ULTIMATE_DURATION_SEC = 20 * 60;
export const ULTIMATE_TIMER_WARNING_SEC = 5 * 60;

export type TopicTestMode = "standard" | "ultimate";

export function parseTopicTestMode(value: unknown): TopicTestMode {
  return value === "ultimate" ? "ultimate" : "standard";
}

export function taskLimitForMode(mode: TopicTestMode): number {
  return mode === "ultimate" ? ULTIMATE_TASK_LIMIT : TOPIC_TEST_TASK_COUNT;
}

export function previewTaskCount(mode: TopicTestMode, bankSize: number): number {
  if (bankSize <= 0) return 0;
  return Math.min(taskLimitForMode(mode), bankSize);
}

/** Parses a requested task count from a form or API payload. */
export function parseRequestedTaskCount(value: unknown): number | null {
  if (typeof value === "string" && value.trim() === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(n) || n < 1 || n > MAX_TOPIC_TEST_TASKS) return null;
  return n;
}

export function clampTaskCount(requested: number, bankSize: number): number {
  if (bankSize <= 0) return 0;
  return Math.min(Math.max(requested, 1), bankSize);
}
