import { parseMathText } from "@/components/ui/MathText/parseMathText";
import { remainingTexCommands, toAdminInput } from "@/modules/admin-content/mathField";
import { absoluteSiteUrl } from "@/lib/siteOrigin";
import { normalizeNmtRichText } from "@/modules/testing/normalizeNmtRichText";

/**
 * One Telegram message per practice or marathon task.
 * Simple TeX becomes Unicode text. Anything MathJax must draw stays a single
 * photo (or the task's own image) with the question as the caption.
 * The site link is attached only when that picture cannot be shown.
 */

const LETTERS = ["А", "Б", "В", "Г", "Д", "Е", "Є", "Ж"] as const;

const SUPERSCRIPT: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", n: "ⁿ", i: "ⁱ",
};

const SUBSCRIPT: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
  "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎",
  a: "ₐ", e: "ₑ", o: "ₒ", x: "ₓ", k: "ₖ", n: "ₙ",
};

const IMAGE = /!\[[^\]]*\]\(([^)\s]+)\)|https?:\/\/\S+\.(?:png|jpe?g|gif|webp)(?:\?\S*)?/gi;

export type TaskButton = { text: string; data?: string; url?: string };

export type TelegramTaskMessage = {
  text: string;
  buttons?: TaskButton[];
  photoUrl?: string;
  formulaTex?: string;
  formulaDisplay?: boolean;
  siteUrl?: string;
  siteLabel?: string;
  /** Picture first. The site button is added only if Telegram never gets the picture. */
  siteOnFail?: boolean;
};

type Piece =
  | { kind: "text"; value: string }
  | { kind: "tex"; tex: string }
  | { kind: "image"; url: string }
  | { kind: "missing" };

type Field = { text: string; tex: string[]; images: string[]; missing: boolean };

function applyScript(value: string, pattern: RegExp, map: Record<string, string>): string {
  return value.replace(pattern, (full, body: string) => {
    const chars = [...body];
    if (chars.length === 0 || chars.some((char) => !map[char])) return full;
    return chars.map((char) => map[char]!).join("");
  });
}

function prettify(value: string): string {
  let out = value;
  out = applyScript(out, /\^\{([^{}]+)\}/g, SUPERSCRIPT);
  out = applyScript(out, /\^([0-9n+\-=()i])/g, SUPERSCRIPT);
  out = applyScript(out, /_\{([^{}]+)\}/g, SUBSCRIPT);
  out = applyScript(out, /_([0-9aeknox])/g, SUBSCRIPT);
  return out;
}

/** Readable stand-in for school TeX, or null when the formula has to be drawn. */
export function formulaToPlain(tex: string): string | null {
  const trimmed = tex
    .trim()
    .replace(/\\dfrac(?![a-zA-Z])/g, "\\frac")
    .replace(/\\tfrac(?![a-zA-Z])/g, "\\frac");
  if (!trimmed) return null;
  const wrapped = `$${trimmed}$`;
  if (remainingTexCommands(wrapped).length > 0) return null;
  const plain = prettify(toAdminInput(wrapped)).replace(/\s+/g, " ").trim();
  if (!plain || /\\/.test(plain)) return null;
  return plain;
}

function publicImageUrl(raw: string): string | null {
  const url = raw.trim().replace(/[),.;]+$/, "");
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("/")) return absoluteSiteUrl(url);
  return null;
}

function piecesOf(raw: string): Piece[] {
  const pieces: Piece[] = [];
  for (const part of parseMathText(normalizeNmtRichText(raw))) {
    if (part.type === "formula") {
      const tex = part.content.trim();
      if (!tex) continue;
      const plain = formulaToPlain(tex);
      if (plain) pieces.push({ kind: "text", value: plain });
      else pieces.push({ kind: "tex", tex });
      continue;
    }
    let cursor = 0;
    for (const match of part.content.matchAll(IMAGE)) {
      const index = match.index ?? 0;
      const before = part.content.slice(cursor, index);
      if (before) pieces.push({ kind: "text", value: before });
      const url = publicImageUrl(match[1] || match[0]);
      pieces.push(url ? { kind: "image", url } : { kind: "missing" });
      cursor = index + match[0].length;
    }
    const after = part.content.slice(cursor);
    if (after) pieces.push({ kind: "text", value: after });
  }
  return pieces;
}

function squash(value: string): string {
  const text = value
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .trim();
  if (!text || /^[.·…,;:!?]+$/.test(text)) return "";
  return text;
}

function fieldOf(raw: string): Field {
  const tex: string[] = [];
  const images: string[] = [];
  let missing = false;
  let text = "";
  for (const piece of piecesOf(raw)) {
    if (piece.kind === "text") text += piece.value;
    else if (piece.kind === "tex") tex.push(piece.tex);
    else if (piece.kind === "image") images.push(piece.url);
    else missing = true;
  }
  return { text: squash(text), tex, images, missing };
}

function optionButton(letter: string, plain: string): string {
  const body = plain.replace(/\s+/g, " ").trim();
  if (!body) return letter;
  const label = `${letter}. ${body}`;
  return label.length <= 64 ? label : letter;
}

function compositeTex(blocks: Array<{ mark: string | null; tex: string }>): string {
  if (blocks.length === 1 && blocks[0]!.mark == null) return blocks[0]!.tex;
  const lines = blocks.map((block) => {
    const body = block.tex.trim();
    return block.mark ? `\\mathrm{(${block.mark})}\\ ${body}` : body;
  });
  return `\\begin{gathered}\n${lines.join(" \\\\\n")}\n\\end{gathered}`;
}

function joinBlocks(blocks: string[]): string {
  return squash(blocks.map((block) => block.trim()).filter(Boolean).join("\n\n"));
}

export function composeTelegramTask(input: {
  heading?: string;
  prompt: string;
  options?: string[];
  optionData?: string[];
  trailingButtons?: TaskButton[];
  siteUrl?: string;
  siteLabel?: string;
}): TelegramTaskMessage {
  const prompt = fieldOf(input.prompt);
  const options = (input.options ?? []).map((option, index) => ({
    letter: LETTERS[index] ?? String(index + 1),
    data: input.optionData?.[index],
    ...fieldOf(option),
  }));
  const lines: string[] = [];
  if (input.heading?.trim()) lines.push(input.heading.trim());
  if (prompt.text) lines.push(prompt.text);
  for (const option of options) {
    if (option.text) lines.push(`${option.letter}. ${option.text}`);
  }
  const texBlocks: Array<{ mark: string | null; tex: string }> = prompt.tex.map((tex) => ({ mark: null, tex }));
  let optionRow = 0;
  const optionNumbers: string[] = [];
  for (const option of options) {
    if (option.tex.length === 0) continue;
    const numbers: string[] = [];
    for (const tex of option.tex) {
      optionRow += 1;
      const mark = String(optionRow);
      numbers.push(mark);
      texBlocks.push({ mark, tex });
    }
    optionNumbers.push(`(${numbers.join(", ")}) ${option.letter}`);
  }
  if (prompt.tex.length > 0 && optionNumbers.length > 0) {
    lines.push(`На зображенні спочатку вираз, далі варіанти: ${optionNumbers.join(", ")}.`);
  } else if (optionNumbers.length > 0) {
    lines.push(`На зображенні варіанти зверху вниз: ${optionNumbers.join(", ")}.`);
  }

  const images = [...prompt.images, ...options.flatMap((option) => option.images)];
  const missing = prompt.missing || options.some((option) => option.missing) || images.length > 1;
  const siteLabel = (input.siteLabel?.trim() || "Відкрити на сайті").slice(0, 64);
  const siteUrl = input.siteUrl?.trim() || undefined;

  const buttons: TaskButton[] = [
    ...options.map((option) => ({
      text: optionButton(option.letter, option.text),
      ...(option.data ? { data: option.data } : {}),
    })),
    ...(input.trailingButtons ?? []),
  ];

  let text = joinBlocks(lines);
  let formulaTex: string | undefined;
  let photoUrl: string | undefined;
  let siteOnFail = false;
  let siteNow = missing;

  if (texBlocks.length > 0) {
    formulaTex = compositeTex(texBlocks);
    siteOnFail = Boolean(siteUrl);
    if (images.length > 0) siteNow = true;
  } else if (images.length > 0) {
    photoUrl = images[0];
    siteOnFail = Boolean(siteUrl);
  }

  if (!text && !formulaTex && !photoUrl) {
    text = buttons.length > 0 ? "Завдання" : "";
    if (!text && siteUrl) siteNow = true;
  }
  if (siteNow && siteUrl && !text) text = siteLabel;

  return {
    text,
    ...(buttons.length > 0 ? { buttons } : {}),
    ...(formulaTex ? { formulaTex, formulaDisplay: true } : {}),
    ...(photoUrl ? { photoUrl } : {}),
    ...((siteOnFail || siteNow) && siteUrl ? { siteUrl, siteLabel } : {}),
    ...(siteOnFail && !siteNow ? { siteOnFail: true } : {}),
  };
}

export function composeRichText(input: {
  text: string;
  buttons?: TaskButton[];
  siteUrl?: string;
  siteLabel?: string;
}): TelegramTaskMessage {
  return composeTelegramTask({
    prompt: input.text,
    trailingButtons: input.buttons,
    siteUrl: input.siteUrl,
    siteLabel: input.siteLabel,
  });
}
