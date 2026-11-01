import { textbookImageMarkup } from "./templates";

/** Left in the markup when a formula from Word or Docs cannot be converted. */
export const FORMULA_REVIEW = "⟦формула⟧";
/** Left in the markup when a picture cannot be stored. */
export const IMAGE_REVIEW = "⟦картинка⟧";
/** Left in the markup when a nested table cannot be converted. */
export const TABLE_REVIEW = "⟦таблиця⟧";

const REVIEW_MARKERS = [FORMULA_REVIEW, IMAGE_REVIEW, TABLE_REVIEW] as const;

export function lineHasImportReview(line: string): boolean {
  return REVIEW_MARKERS.some((marker) => line.includes(marker));
}

/**
 * A plain paragraph from the clipboard is not an import.
 * Word and Docs still wrap that paragraph in HTML, often without bold,
 * lists, tables, pictures, or math.
 */
export function htmlLooksRich(html: string): boolean {
  const sample = html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<(?:b|strong)\b[^>]*font-weight\s*:\s*normal[^>]*>/gi, "<span>");
  return /<(?:h[1-6]|ul|ol|table|img|math)\b|<(?:strong|em|b|i|u)\b|font-weight\s*:\s*(?:bold|[6-9]00)|font-style\s*:\s*italic|text-decoration[^;>]*underline|oMath/i.test(
    sample,
  );
}

/** Swap picture markers for markup that was uploaded separately (clipboard files). */
export function replaceImageReviews(
  markup: string,
  replacements: readonly string[],
): { markup: string; used: number } {
  let used = 0;
  const next = markup.replaceAll(IMAGE_REVIEW, () => {
    const replacement = replacements[used];
    if (!replacement) return IMAGE_REVIEW;
    used += 1;
    return replacement;
  });
  return { markup: next, used };
}

export function uploadedImageMarkup(alt: string, src: string): string {
  return textbookImageMarkup(alt, src);
}
