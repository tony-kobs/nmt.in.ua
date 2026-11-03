const MATCH_CYRILLIC_TO_LATIN: Record<string, string> = {
  а: "a",
  б: "b",
  в: "c",
  г: "d",
  д: "e",
};

/** `MM:SS` for the simulator countdown. Minutes are not capped at 59. */
export function formatNmtClock(seconds: number): string {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  const secs = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/** Index stays inside the task list. An empty list stays at 0. */
export function clampTaskIndex(index: number, length: number): number | null {
  if (index < 0 || index >= length) return null;
  return index;
}

/** Stored keys are `1b;2d;3a`. A Cyrillic letter from an older client still fills the select. */
export function matchLetterAt(answerText: string, row: number): string {
  const raw = answerText.match(new RegExp(`${row}([a-eабвгд])`, "i"))?.[1]?.toLowerCase() ?? "";
  return MATCH_CYRILLIC_TO_LATIN[raw] ?? raw;
}

/** Three selected letters become the stored matching answer. */
export function buildMatchAnswer(draft: readonly [string, string, string]): string | null {
  if (draft.some((value) => !value)) return null;
  return `1${draft[0]};2${draft[1]};3${draft[2]}`;
}
