/**
 * Answer letters for tests, the bot, and the textbook.
 * А–Д are the NMT options. Longer lists exist where a task can have more
 * choices. Callers slice to the length they actually render.
 */
export const ANSWER_LETTERS = ["А", "Б", "В", "Г", "Д", "Е", "Є", "Ж"] as const;

export function answerLetter(index: number): string {
  return ANSWER_LETTERS[index] ?? String(index + 1);
}
