const OPTION_LETTERS = ["А", "Б", "В", "Г", "Д", "Е"] as const;

export type GradedOptionState = "idle" | "selected" | "correct" | "wrong" | "key";

/**
 * A revealed correct, key, or wrong state wins over the picked outline.
 * The outline stays only while the answer is not yet graded.
 */
export function gradedOptionState(input: {
  selected?: boolean;
  correct?: boolean;
  wrong?: boolean;
  key?: boolean;
}): GradedOptionState {
  if (input.correct) return "correct";
  if (input.key) return "key";
  if (input.wrong) return "wrong";
  if (input.selected) return "selected";
  return "idle";
}

/** 0-based index → літера варіанта, як у шкільному тесті (А, Б, В…). */
export function optionLetter(index: number): string {
  return OPTION_LETTERS[index] ?? String(index + 1);
}

/**
 * Short task title for the uppercase line under the heading.
 * A long name is the question itself, so it stays in the prompt.
 */
export function taskKicker(
  name: string | null | undefined,
  prompt?: string,
): string | undefined {
  const trimmed = name?.trim() ?? "";
  if (!trimmed) return undefined;
  if (prompt && trimmed === prompt.trim()) return undefined;
  if (trimmed.length > 72) return undefined;
  return trimmed;
}

/**
 * Formulae and long options do not fit two columns at 375px.
 * Short labels stay in two columns from 375; these wait until 768.
 */
export function topicOptionsStackUntilTablet(texts: readonly string[]): boolean {
  return texts.some((text) => {
    if (/\$|!\[/.test(text)) return true;
    return text.trim().length > 48;
  });
}
