import "server-only";

import catalogJson from "./nmtMatchCatalog.json";
import { normalizeNmtRichText } from "./normalizeNmtRichText";

/**
 * Official NMT matching tasks ("логічні пари") store the stem in
 * `task_text` and, in the current bank, only the letters А–Д in
 * `answer_1..5`. The expressions themselves were dropped at import
 * because they live in `.answers.col`, not in the question. This module
 * puts them back at read time.
 *
 * Scoring stays `1b;2c;3a` (latin letter = column А Б В Г Д). A future
 * import can embed the same payload in `task_text`; that copy wins over
 * the catalog. Real option text already stored in `answer_*` also wins
 * over the catalog, so a corrected row is not overwritten.
 */

export const NMT_MATCH_OPEN = "[[nmt-match]]";
export const NMT_MATCH_CLOSE = "[[/nmt-match]]";

export const NMT_MATCH_CHOICES = [
  { value: "a", label: "А" },
  { value: "b", label: "Б" },
  { value: "c", label: "В" },
  { value: "d", label: "Г" },
  { value: "e", label: "Д" },
] as const;

export type NmtMatchChoiceValue = (typeof NMT_MATCH_CHOICES)[number]["value"];

export type NmtMatchOption = {
  value: NmtMatchChoiceValue;
  label: string;
  text: string;
};

export type NmtMatchView = {
  leftTitle: string;
  rightTitle: string;
  /** Prompts 1–3. Empty string when that row was not in the source. */
  left: string[];
  right: NmtMatchOption[];
};

export type NmtMatchResolution = {
  stem: string;
  match: NmtMatchView;
};

type CatalogEntry = {
  leftTitle: string;
  rightTitle: string;
  left: string[];
  right: string[];
};

type EmbedPayload = {
  leftTitle?: unknown;
  rightTitle?: unknown;
  left?: unknown;
  right?: unknown;
};

const CATALOG = catalogJson as Record<string, CatalogEntry>;

const PLACEHOLDER_OPTION = /^[АБВГДабвгдA-Ea-e]$/u;

export function isPlaceholderMatchOption(text: string): boolean {
  return PLACEHOLDER_OPTION.test(text.trim());
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function asTitle(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function splitNmtMatchEmbed(taskText: string): {
  stem: string;
  embed: EmbedPayload | null;
} {
  const start = taskText.indexOf(NMT_MATCH_OPEN);
  const end = taskText.indexOf(NMT_MATCH_CLOSE);
  if (start === -1 || end < start) {
    return { stem: taskText, embed: null };
  }
  const json = taskText.slice(start + NMT_MATCH_OPEN.length, end).trim();
  let embed: EmbedPayload | null = null;
  try {
    const parsed = JSON.parse(json) as unknown;
    if (parsed && typeof parsed === "object") embed = parsed as EmbedPayload;
  } catch {
    embed = null;
  }
  const stem = `${taskText.slice(0, start)}${taskText.slice(end + NMT_MATCH_CLOSE.length)}`.trim();
  return { stem, embed };
}

function catalogEntry(name: string): CatalogEntry | null {
  const key = name.trim().replace(/\s+/g, " ");
  return CATALOG[key] ?? null;
}

function hasRealOption(texts: readonly string[]): boolean {
  return texts.some((text) => text.trim() !== "" && !isPlaceholderMatchOption(text));
}

function slotsFromAnswers(
  answers: readonly { number?: number; text: string }[],
): string[] {
  const slots = ["", "", "", "", ""];
  answers.forEach((answer, index) => {
    const slot = (answer.number ?? index + 1) - 1;
    if (slot >= 0 && slot < slots.length) slots[slot] = answer.text;
  });
  return slots;
}

function normalizeList(texts: readonly string[], size: number): string[] {
  const out = Array.from({ length: size }, () => "");
  texts.forEach((text, index) => {
    if (index < size) out[index] = normalizeNmtRichText(text);
  });
  return out;
}

/**
 * Build the student-facing matching card. Returns null for tasks that are
 * not matching items (no catalog row, no embedded payload, kind is not
 * `match`), so topic tests stay unchanged.
 */
export function resolveNmtMatch(input: {
  name: string;
  taskText: string;
  answers?: readonly { number?: number; text: string }[];
  taskKind?: string | null;
}): NmtMatchResolution | null {
  const { stem, embed } = splitNmtMatchEmbed(input.taskText ?? "");
  const fromCatalog = catalogEntry(input.name);
  const isMatch = input.taskKind === "match" || embed !== null || fromCatalog !== null;
  if (!isMatch) return null;

  const embedLeft = asStringList(embed?.left);
  const embedRight = asStringList(embed?.right);
  const dbRight = slotsFromAnswers(input.answers ?? []).map((text) =>
    normalizeNmtRichText(text),
  );

  const left = hasRealOption(embedLeft)
    ? normalizeList(embedLeft, 3)
    : normalizeList(fromCatalog?.left ?? [], 3);

  let rightTexts: string[];
  if (hasRealOption(embedRight)) {
    rightTexts = normalizeList(embedRight, 5);
  } else if (hasRealOption(dbRight)) {
    rightTexts = dbRight.map((text) =>
      isPlaceholderMatchOption(text) ? "" : text,
    );
  } else {
    rightTexts = normalizeList(fromCatalog?.right ?? [], 5);
  }

  const leftTitle = normalizeNmtRichText(
    asTitle(embed?.leftTitle) || fromCatalog?.leftTitle || "",
  );
  const rightTitle = normalizeNmtRichText(
    asTitle(embed?.rightTitle) || fromCatalog?.rightTitle || "",
  );

  return {
    stem: normalizeNmtRichText(stem),
    match: {
      leftTitle,
      rightTitle,
      left,
      right: NMT_MATCH_CHOICES.map((choice, index) => ({
        value: choice.value,
        label: choice.label,
        text: rightTexts[index] ?? "",
      })),
    },
  };
}
