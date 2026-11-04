import { latexToTelegramPlain } from "@/modules/telegram/latexPlain";

const CYRILLIC_LOWER = ["а", "б", "в", "г", "д", "е", "є", "ж"];
const CYRILLIC_UPPER = ["А", "Б", "В", "Г", "Д", "Е", "Є", "Ж"];

const OPTION_LINE = /^([A-Za-zА-Яа-яІіЄєЇїҐґ])\s*[.)]\s*(.+)$/u;

function letterIndex(letter: string): number | null {
  const lower = CYRILLIC_LOWER.indexOf(letter);
  if (lower >= 0) return lower;
  const upper = CYRILLIC_UPPER.indexOf(letter);
  if (upper >= 0) return upper;
  const latin = "ABCDEFGH".indexOf(letter.toUpperCase());
  return latin >= 0 ? latin : null;
}

function fold(value: string): string {
  return latexToTelegramPlain(value)
    .replace(/\u00a0/g, " ")
    .replace(/[−–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function parseOptionLine(line: string): { index: number; letter: string; body: string } | null {
  const match = OPTION_LINE.exec(line.trim());
  if (!match?.[1] || !match[2]) return null;
  const index = letterIndex(match[1]);
  if (index == null) return null;
  return { index, letter: match[1], body: match[2].trim() };
}

function sameBody(letter: string, body: string, option: string): boolean {
  const foldedBody = fold(body);
  const foldedOption = fold(option);
  if (!foldedBody || !foldedOption) return false;
  if (foldedBody === foldedOption) return true;
  const upper = letter.toLocaleUpperCase("uk-UA");
  if (fold(`${upper}. ${body}`) === foldedOption || fold(`${upper}) ${body}`) === foldedOption) {
    return true;
  }
  const nested = parseOptionLine(foldedOption);
  return nested != null && fold(nested.body) === foldedBody;
}

/**
 * Drop a trailing block `А. …` / `A. …` (also `)`) when each line repeats the
 * option at that index, starting from the first option. A mention in the
 * middle, a single line, or lines that are not these options stays.
 * The result is empty when the prompt was only that block.
 */
export function stripCopiedOptionLines(prompt: string, options: readonly string[]): string {
  const normalized = prompt.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (options.length < 2 || !normalized) return normalized;
  const lines = normalized.split("\n");
  let cursor = lines.length - 1;
  while (cursor >= 0 && lines[cursor]!.trim() === "") cursor -= 1;

  const found: Array<{ index: number; letter: string; body: string; at: number }> = [];
  while (cursor >= 0) {
    const raw = lines[cursor]!.trim();
    if (!raw) {
      let look = cursor - 1;
      while (look >= 0 && lines[look]!.trim() === "") look -= 1;
      if (look < 0 || !parseOptionLine(lines[look]!)) break;
      cursor = look;
      continue;
    }
    const parsed = parseOptionLine(raw);
    if (!parsed) break;
    found.push({ ...parsed, at: cursor });
    cursor -= 1;
  }
  found.reverse();
  if (found.length < 2) return normalized;
  const matches = found.every((item, position) => (
    item.index === position
    && position < options.length
    && sameBody(item.letter, item.body, options[position] ?? "")
  ));
  if (!matches) return normalized;
  return lines.slice(0, found[0]!.at).join("\n").trim();
}

/** Same strip, but a prompt that would become empty keeps its original text. */
export function promptWithoutCopiedOptions(prompt: string, options: readonly string[]): string {
  const stripped = stripCopiedOptionLines(prompt, options);
  return stripped.trim() ? stripped : prompt.trim();
}
