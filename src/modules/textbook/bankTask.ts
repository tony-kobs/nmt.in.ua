import type { MaterialContentBlock } from "@/content/learningMaterials/sourceBlocks";

export const BANK_KINDS = ["quiz", "nmt", "problem"] as const;

export type BankKind = (typeof BANK_KINDS)[number];

export type BankTaskOption = {
  letter: string;
  text: string;
  correct: boolean;
};

export type BankTaskMatch = {
  leftTitle: string;
  rightTitle: string;
  left: string[];
  right: { value: "a" | "b" | "c" | "d" | "e"; label: string; text: string }[];
};

/** Snapshot loaded from the bank at render time. The markup stores only `bank:id`. */
export type BankTaskView = {
  ref: string;
  bank: BankKind;
  id: number;
  kind: "mcq" | "match" | "open";
  name: string;
  prompt: string;
  image: { src: string; alt: string } | null;
  options: BankTaskOption[];
  match: BankTaskMatch | null;
  answer: string | null;
  explanation: string | null;
};

export type BankTaskHit = {
  ref: string;
  bank: BankKind;
  id: number;
  name: string;
  theme: string;
  excerpt: string;
};

const LETTERS = ["А", "Б", "В", "Г", "Д", "Е"] as const;
const REF = /^(quiz|nmt|problem):([1-9]\d{0,8})$/;
const MYSQL_INT_MAX = 2147483647;

export function bankOptionLetter(index: number): string {
  return LETTERS[index] ?? String(index + 1);
}

export function parseBankTaskRef(token: string): { bank: BankKind; id: number } | null {
  const match = REF.exec(token.trim());
  if (!match) return null;
  const id = Number(match[2]);
  if (!Number.isInteger(id) || id < 1 || id > MYSQL_INT_MAX) return null;
  return { bank: match[1] as BankKind, id };
}

export function bankTaskToken(bank: BankKind, id: number): string {
  return `${bank}:${id}`;
}

export function bankTaskMarkup(bank: BankKind, id: number): string {
  return `:::task ${bank}:${id}`;
}

export function parseBankTaskLine(line: string): { bank: BankKind; id: number } | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith(":::task ")) return null;
  return parseBankTaskRef(trimmed.slice(":::task ".length));
}

export function isBankTaskLine(line: string): boolean {
  return line.trim().startsWith(":::task");
}

export function listTextbookTaskRefs(source: string): { line: number; ref: string }[] {
  return source.replace(/\r\n/g, "\n").split("\n").flatMap((raw, index) => {
    const parsed = parseBankTaskLine(raw);
    if (!parsed) return [];
    return [{ line: index + 1, ref: bankTaskToken(parsed.bank, parsed.id) }];
  });
}

export function bankTaskRefsInBlocks(
  blocks: readonly MaterialContentBlock[],
): { bank: BankKind; id: number }[] {
  const refs: { bank: BankKind; id: number }[] = [];
  const walk = (list: readonly MaterialContentBlock[]) => {
    for (const block of list) {
      if (block.type === "bankTask") refs.push({ bank: block.bank, id: block.id });
      if (block.type === "table") {
        for (const row of block.rows) {
          for (const cell of row.cells) walk(cell.blocks);
        }
      }
    }
  };
  walk(blocks);
  return refs;
}

/**
 * A missing row is a warning in the editor and a gap in the student chapter.
 * A loaded row is the card in both places.
 */
export function bankTaskRenderPlan(
  view: BankTaskView | undefined,
  mode: "student" | "admin",
): "card" | "skip" | "warn" {
  if (view) return "card";
  return mode === "admin" ? "warn" : "skip";
}

const MATCH_LETTERS: Record<string, string> = {
  a: "А",
  b: "Б",
  c: "В",
  d: "Г",
  e: "Д",
  а: "А",
  б: "Б",
  в: "В",
  г: "Г",
  д: "Д",
};

/** `1b;2c;3a` → `1 — Б, 2 — В, 3 — А`. Unknown text is kept as written. */
export function formatMatchAnswer(raw: string | null | undefined): string | null {
  const text = (raw ?? "").trim();
  if (!text) return null;
  const rows: string[] = [];
  for (const part of text.split(/[;,]+/)) {
    const match = /^\s*(\d+)\s*([a-eабвгд])\s*$/i.exec(part);
    if (!match) continue;
    const letter = MATCH_LETTERS[match[2]!.toLowerCase()] ?? match[2]!.toUpperCase();
    rows.push(`${match[1]} — ${letter}`);
  }
  return rows.length > 0 ? rows.join(", ") : text;
}

export function presentOpenAnswer(raw: string | null | undefined): string | null {
  const text = (raw ?? "").trim();
  if (!text) return null;
  if (text.includes("\\") && !/\\\(|\\\[|\$/.test(text)) return `\\(${text}\\)`;
  return text;
}

export function bankExcerpt(text: string): string {
  const plain = text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\$\$[\s\S]*?\$\$/g, " ")
    .replace(/\$[^$\n]+\$/g, " ")
    .replace(/\\\[[\s\S]*?\\\]/g, " ")
    .replace(/\\\([\s\S]*?\\\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= 160) return plain;
  return `${plain.slice(0, 157)}…`;
}

/** Same path rule as textbook images: a site path, never a remote URL. */
export function taskImageSrc(src: string): string | null {
  const trimmed = src.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  if (trimmed.includes("..") || trimmed.includes("\\") || /\s/.test(trimmed)) return null;
  if (!/^\/[A-Za-z0-9/_\-.]+$/.test(trimmed)) return null;
  return trimmed;
}
