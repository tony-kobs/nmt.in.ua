/**
 * The printable workbook is the fetched catalog in `workbookProblems.json`,
 * not a MySQL table. Arithmetic lines there mix `16+2=?` and `25 - 9 = ?`.
 * Only those lines are normalized. Ordinary Ukrainian sentences stay as stored.
 */
const ARITHMETIC = /^[\d\s+\-−–—×*/:=?.(),]+$/u;

export function normalizeWorkbookPrompt(text: string): string {
  const trimmed = text.trim();
  if (!ARITHMETIC.test(trimmed)) return text;
  return trimmed
    .replace(/(\d)\s*([+\-−–—×*/])\s*(?=\d)/gu, (_full, digit: string, op: string) => {
      const symbol = op === "-" || op === "–" || op === "—" ? "−" : op === "*" ? "×" : op;
      return `${digit} ${symbol} `;
    })
    .replace(/\s*=\s*/g, " = ")
    .replace(/\s+\?/g, " ?")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
