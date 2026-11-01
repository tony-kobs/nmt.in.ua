import { isUploadPlaceholderSrc } from "./imageLimits";

export const SNIPPET_IDS = [
  "heading",
  "subheading",
  "list",
  "formula",
  "table",
  "grid",
  "graph",
  "image",
  "task",
  "note",
] as const;

export type SnippetId = (typeof SNIPPET_IDS)[number];

export type TextEdit = {
  value: string;
  selectionStart: number;
  selectionEnd: number;
};

const IMAGE_TEMPLATE_SRC = "/materials/textbook/image.webp";
const TASK_LETTERS = ["А", "Б", "В", "Г", "Д"] as const;

export function textbookImageMarkup(alt: string, src: string): string {
  const safeAlt = alt.replace(/[\[\]]/g, "").replace(/\s+/g, " ").trim() || "Зображення";
  return `![${safeAlt}](${src})`;
}

export function uploadPlaceholder(token: string): string {
  return `![Завантаження…](${token})`;
}

function slot(before: string, selected: string, after: string): {
  text: string;
  selectStart: number;
  selectEnd: number;
} {
  return {
    text: before + selected + after,
    selectStart: before.length,
    selectEnd: before.length + selected.length,
  };
}

function singleLine(selected: string): string | null {
  const text = selected.trim();
  if (!text || text.includes("\n")) return null;
  return text;
}

function snippetBody(
  id: SnippetId,
  selected: string,
): {
  text: string;
  selectStart: number;
  selectEnd: number;
  inline: boolean;
  usesSelection: boolean;
} {
  const line = singleLine(selected);
  if (id === "formula" && line && !line.includes("\\")) {
    const wrapped = slot("\\(", line, "\\)");
    return { ...wrapped, inline: true, usesSelection: true };
  }
  if (id === "heading") {
    const built = slot("# ", line ?? "Заголовок", "");
    return { ...built, inline: false, usesSelection: Boolean(line) };
  }
  if (id === "subheading") {
    const built = slot("## ", line ?? "Підзаголовок", "");
    return { ...built, inline: false, usesSelection: Boolean(line) };
  }
  if (id === "list") {
    const built = line
      ? slot("- ", line, "")
      : slot("- ", "перший пункт", "\n- другий пункт");
    return { ...built, inline: false, usesSelection: Boolean(line) };
  }
  if (id === "formula") {
    const built = slot("\\[", "y = x", "\\]");
    return { ...built, inline: false, usesSelection: false };
  }
  if (id === "table") {
    const text = ["| X | -1 | 0 | 1 |", "| --- | --- | --- | --- |", "| Y |  |  |  |"].join(
      "\n",
    );
    return {
      text,
      selectStart: text.lastIndexOf("Y"),
      selectEnd: text.lastIndexOf("Y") + 1,
      inline: false,
      usesSelection: false,
    };
  }
  if (id === "grid") {
    const text = ":::paper 12 12 284";
    const at = text.indexOf("12");
    return { text, selectStart: at, selectEnd: at + "12 12".length, inline: false, usesSelection: false };
  }
  if (id === "graph") {
    const formula = "y = x - 3";
    const text = [":::graph", `\\[${formula}\\]`, "", "| X | -1 | 0 | 1 |", "| --- | --- | --- | --- |", "| Y |  |  |  |", ":::"].join(
      "\n",
    );
    const at = text.indexOf(formula);
    return { text, selectStart: at, selectEnd: at + formula.length, inline: false, usesSelection: false };
  }
  if (id === "image") {
    const alt = line ?? "підпис";
    const text = textbookImageMarkup(alt, IMAGE_TEMPLATE_SRC);
    const at = text.lastIndexOf(IMAGE_TEMPLATE_SRC);
    return {
      text,
      selectStart: at,
      selectEnd: at + IMAGE_TEMPLATE_SRC.length,
      inline: false,
      usesSelection: Boolean(line),
    };
  }
  if (id === "task") {
    const stem = line ?? "Обчисліть \\(2 + 3\\).";
    const options = TASK_LETTERS.map((letter, index) => `- ${letter}) \\(${index + 4}\\)`).join(
      "\n",
    );
    const text = ["## Задача", "", stem, "", options, "", "**Відповідь.** Б"].join("\n");
    const at = text.indexOf(stem);
    return { text, selectStart: at, selectEnd: at + stem.length, inline: false, usesSelection: Boolean(line) };
  }
  const body = line ?? "Коротке зауваження до правила.";
  const built = slot("**Примітка.** ", body, "");
  return { ...built, inline: false, usesSelection: Boolean(line) };
}

function spliceBlock(value: string, start: number, end: number, block: string, selectStart: number, selectEnd: number): TextEdit {
  const before = value.slice(0, start).replace(/[ \t]+$/g, "");
  const after = value.slice(end).replace(/^[ \t]+/g, "");
  const prefix = before.length === 0 || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const suffix =
    after.length === 0 || after.startsWith("\n\n") ? "" : after.startsWith("\n") ? "\n" : "\n\n";
  const next = before + prefix + block + suffix + after;
  const base = before.length + prefix.length;
  return {
    value: next,
    selectionStart: base + selectStart,
    selectionEnd: base + selectEnd,
  };
}

/** Insert a ready block, or wrap a single-line selection in an inline formula. */
export function applyTextbookSnippet(
  value: string,
  start: number,
  end: number,
  id: SnippetId,
): TextEdit {
  const safeStart = Math.max(0, Math.min(start, value.length));
  const safeEnd = Math.max(safeStart, Math.min(end, value.length));
  const selected = value.slice(safeStart, safeEnd);
  const built = snippetBody(id, selected);
  if (built.inline) {
    const next = value.slice(0, safeStart) + built.text + value.slice(safeEnd);
    return {
      value: next,
      selectionStart: safeStart + built.selectStart,
      selectionEnd: safeStart + built.selectEnd,
    };
  }
  const from = built.usesSelection ? safeStart : safeEnd;
  const to = built.usesSelection ? safeEnd : safeEnd;
  return spliceBlock(value, from, to, built.text, built.selectStart, built.selectEnd);
}

/** Insert uploaded markup (or a progress placeholder) as its own block. */
export function insertMarkupBlock(value: string, start: number, end: number, markup: string): TextEdit {
  const safeStart = Math.max(0, Math.min(start, value.length));
  const safeEnd = Math.max(safeStart, Math.min(end, value.length));
  return spliceBlock(value, safeStart, safeEnd, markup, markup.length, markup.length);
}

export function replaceMarkupToken(value: string, token: string, replacement: string): string {
  if (!isUploadPlaceholderSrc(token)) return value;
  const marker = uploadPlaceholder(token);
  const at = value.indexOf(marker);
  if (at === -1) return value;
  return value.slice(0, at) + replacement + value.slice(at + marker.length);
}
