/**
 * The card lightbulb shows a nudge, not the worked solution.
 *
 * `quiz_tasks.hint_direction` and `hint_rule` are the ladder nudges.
 * `hint_example` is a worked solution and is never returned.
 * `comments` is the admin field «Підказка / коментар». It is used only when
 * the ladder is empty and the text does not announce the correct answer
 * (seed rows start with «Правильна відповідь»).
 */
export function selectCardHint(input: {
  direction?: string | null;
  rule?: string | null;
  comments?: string | null;
}): string | null {
  const direction = input.direction?.trim() ?? "";
  if (direction) return direction;
  const rule = input.rule?.trim() ?? "";
  if (rule) return rule;
  const comments = input.comments?.trim() ?? "";
  if (!comments) return null;
  if (/^правильна\s+відповідь/iu.test(comments)) return null;
  return comments;
}
