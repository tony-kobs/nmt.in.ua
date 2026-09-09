/** Canonical deep-link into the textbook for a theme code. */
export function textbookTopicHref(themeCode: string): string {
  return `/materials/textbook?topic=${encodeURIComponent(themeCode)}`;
}
