/**
 * Task banks store percents as `\text{%}`. TeX treats a bare `%` as a comment,
 * so KaTeX paints the source in red instead of «25%». The same happens for
 * `#`, `$`, `&`, `_` and `^` inside a text command. Fix it in the renderer.
 */

const TEXT_COMMANDS = [
  "textnormal",
  "textrm",
  "textbf",
  "textit",
  "textsf",
  "texttt",
  "textup",
  "textmd",
  "text",
  "mbox",
  "hbox",
];

const TEXT_SPECIAL = new Set(["%", "#", "$", "&", "_", "^"]);

function isEscaped(source: string, index: number): boolean {
  let slashes = 0;
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === "\\"; cursor -= 1) {
    slashes += 1;
  }
  return slashes % 2 === 1;
}

function textCommandAt(source: string, index: number): string | null {
  if (source[index] !== "\\") return null;
  for (const name of TEXT_COMMANDS) {
    if (!source.startsWith(name, index + 1)) continue;
    const after = source[index + 1 + name.length];
    if (after && /[A-Za-z]/.test(after)) continue;
    return name;
  }
  return null;
}

function braceEnd(source: string, open: number): number {
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "\\" && index + 1 < source.length) {
      index += 1;
      continue;
    }
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function escapeTextSpecials(inner: string): string {
  let out = "";
  for (let index = 0; index < inner.length; index += 1) {
    const char = inner[index] ?? "";
    if (char === "\\") {
      out += char;
      if (index + 1 < inner.length) {
        out += inner[index + 1];
        index += 1;
      }
      continue;
    }
    out += TEXT_SPECIAL.has(char) ? `\\${char}` : char;
  }
  return out;
}

/** Escape literal symbols so KaTeX shows them instead of a comment or an error. */
export function prepareFormulaForKatex(formula: string): string {
  let out = "";
  for (let index = 0; index < formula.length; index += 1) {
    const name = textCommandAt(formula, index);
    if (name) {
      let cursor = index + 1 + name.length;
      while (formula[cursor] === " ") cursor += 1;
      if (formula[cursor] === "{") {
        const end = braceEnd(formula, cursor);
        if (end !== -1) {
          out += `\\${name}{${escapeTextSpecials(formula.slice(cursor + 1, end))}}`;
          index = end;
          continue;
        }
      }
    }
    const char = formula[index] ?? "";
    if (char === "%" && !isEscaped(formula, index)) out += "\\%";
    else out += char;
  }
  return out;
}

/** Readable characters inside `\text{…}` / `\mathrm{…}`. */
export function decodeTextCommandInner(inner: string): string {
  return inner
    .replace(/\\%/g, "%")
    .replace(/\\#/g, "#")
    .replace(/\\&/g, "&")
    .replace(/\\\$/g, "$")
    .replace(/\\_/g, "_")
    .replace(/\\\^/g, "^")
    .replace(/\\circ(?![A-Za-z])/g, "°")
    .replace(/\\degree(?![A-Za-z])/g, "°")
    .replace(/\\([{}])/g, "$1");
}

const LOOSE_TEXT =
  /\\(?:textnormal|textrm|textbf|textit|textsf|texttt|textup|textmd|text|mbox|hbox|mathrm)\{((?:\\.|[^{}])*)\}/g;

/** Turn a bare `\text{%}` in prose into «%». Real commands stay for KaTeX. */
export function revealTextCommands(text: string): string {
  return text.replace(LOOSE_TEXT, (full, inner: string) => {
    const decoded = decodeTextCommandInner(inner).replace(/\s+/g, " ").trim();
    if (/\\[A-Za-z]/.test(decoded)) return full;
    return decoded;
  });
}
