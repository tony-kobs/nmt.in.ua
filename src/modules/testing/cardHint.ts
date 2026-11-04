/**
 * The card lightbulb shows a short nudge from `quiz_tasks.hint_short`.
 *
 * `comments` is the worked solution (often the answer). `hint_direction` and
 * `hint_rule` belong to the post-answer ladder. Neither is a substitute when
 * the short field is empty: the bulb stays hidden.
 */
const MAX_HINT_CHARS = 280;

export function selectCardHint(input: { short?: string | null }): string | null {
  const text = input.short?.replace(/\s+/g, " ").trim() ?? "";
  if (!text || text.length > MAX_HINT_CHARS) return null;
  if (/^правильна\s+відповідь/iu.test(text)) return null;
  if (/відповідь\s*:/iu.test(text)) return null;
  if (/(?:^|\P{L})тому(?:\P{L}|$)/iu.test(text)) return null;
  if (/найбільш\p{L}*\s+ціл/iu.test(text)) return null;
  const sentences = text.split(/(?<=[.!?])\s+/u).filter(Boolean);
  if (sentences.length > 2) return null;
  return text;
}
