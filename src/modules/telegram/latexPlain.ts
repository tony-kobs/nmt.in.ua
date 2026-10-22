/**
 * One LaTeX → Telegram plain-text pass for every bot bubble and button.
 * The site still renders the same strings with KaTeX.
 * A formula with `\begin{…}` stays a picture (`formulaToPlain` returns null).
 */

const SUPER: Record<string, string> = {
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", n: "ⁿ", i: "ⁱ",
};

const SUB: Record<string, string> = {
  "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉",
  "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎",
  a: "ₐ", e: "ₑ", o: "ₒ", x: "ₓ", k: "ₖ", n: "ₙ",
};

const SIMPLE = /^[0-9A-Za-zπ√°⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼ⁿⁱ₀₁₂₃₄₅₆₇₈₉₊₋₌ₐₑₒₓₖₙ]+$/u;

/** Longer names first so `\infty` is not read as `\in`. */
const SYMBOLS: Array<[string, string]> = [
  ["leqslant", "≤"],
  ["geqslant", "≥"],
  ["Leftarrow", "⇐"],
  ["Rightarrow", "⇒"],
  ["Leftrightarrow", "⇔"],
  ["subseteq", "⊆"],
  ["emptyset", "∅"],
  ["infty", "∞"],
  ["ldots", "…"],
  ["cdots", "…"],
  ["times", "×"],
  ["cdot", "·"],
  ["leqq", "≤"],
  ["geqq", "≥"],
  ["leq", "≤"],
  ["geq", "≥"],
  ["neq", "≠"],
  ["div", ":"],
  ["pm", "±"],
  ["mp", "∓"],
  ["le", "≤"],
  ["ge", "≥"],
  ["ne", "≠"],
  ["pi", "π"],
  ["in", "∈"],
  ["cup", "∪"],
  ["cap", "∩"],
  ["to", "→"],
  ["degree", "°"],
  ["circ", "°"],
];

const DELIMS = [
  { open: "\\[", close: "\\]" },
  { open: "\\(", close: "\\)" },
  { open: "$$", close: "$$" },
  { open: "$", close: "$" },
] as const;

function readBrace(input: string, openIdx: number): { inner: string; end: number } | null {
  if (input[openIdx] !== "{") return null;
  let depth = 0;
  for (let i = openIdx; i < input.length; i += 1) {
    if (input[i] === "{") depth += 1;
    else if (input[i] === "}") {
      depth -= 1;
      if (depth === 0) return { inner: input.slice(openIdx + 1, i), end: i + 1 };
    }
  }
  return null;
}

function scriptOf(body: string, map: Record<string, string>, fallback: (body: string) => string): string {
  const chars = [...body];
  if (chars.length > 0 && chars.every((char) => map[char])) {
    return chars.map((char) => map[char]!).join("");
  }
  return fallback(body);
}

function applyScripts(input: string): string {
  let out = "";
  let depth = 0;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i]!;
    if (ch === "{") {
      depth += 1;
      out += ch;
      continue;
    }
    if (ch === "}" && depth > 0) {
      depth -= 1;
      out += ch;
      continue;
    }
    if (depth === 0 && (ch === "^" || ch === "_")) {
      const map = ch === "^" ? SUPER : SUB;
      const fallback = ch === "^" ? (body: string) => `^(${body})` : (body: string) => `_(${body})`;
      if (input[i + 1] === "{") {
        const group = readBrace(input, i + 1);
        if (group) {
          out += scriptOf(group.inner, map, fallback);
          i = group.end - 1;
          continue;
        }
      } else {
        const next = input[i + 1];
        if (next && map[next] && next !== "(" && next !== ")") {
          out += map[next];
          i += 1;
          continue;
        }
      }
    }
    out += ch;
  }
  return out;
}

function isSimple(value: string): boolean {
  return SIMPLE.test(value);
}

function readArg(input: string, i: number, depth: number): { value: string; end: number } | null {
  if (i >= input.length) return null;
  if (input[i] === "{") {
    const group = readBrace(input, i);
    if (!group) return null;
    return { value: convertTexBody(group.inner, depth + 1), end: group.end };
  }
  const ch = input[i]!;
  if (/[0-9A-Za-z]/.test(ch)) return { value: ch, end: i + 1 };
  return null;
}

function replaceFrac(input: string, depth: number): string {
  const needle = "\\frac";
  let out = "";
  let i = 0;
  while (i < input.length) {
    const idx = input.indexOf(needle, i);
    if (idx === -1) {
      out += input.slice(i);
      break;
    }
    const after = idx + needle.length;
    if (/[A-Za-z]/.test(input[after] ?? "")) {
      out += input.slice(i, after);
      i = after;
      continue;
    }
    out += input.slice(i, idx);
    const left = readArg(input, after, depth);
    if (!left) {
      out += needle;
      i = after;
      continue;
    }
    const right = readArg(input, left.end, depth);
    if (!right) {
      out += input.slice(idx, left.end);
      i = left.end;
      continue;
    }
    const a = left.value.trim();
    const b = right.value.trim();
    const body = isSimple(a) && isSimple(b) ? `${a}/${b}` : `(${a})/(${b})`;
    const prev = out[out.length - 1];
    out += prev && /[0-9]/.test(prev) ? ` ${body}` : body;
    i = right.end;
  }
  return out;
}

function replaceSqrt(input: string, depth: number): string {
  const needle = "\\sqrt";
  let out = "";
  let i = 0;
  while (i < input.length) {
    const idx = input.indexOf(needle, i);
    if (idx === -1) {
      out += input.slice(i);
      break;
    }
    const after = idx + needle.length;
    if (/[A-Za-z]/.test(input[after] ?? "")) {
      out += input.slice(i, after);
      i = after;
      continue;
    }
    out += input.slice(i, idx);
    let cursor = after;
    while (input[cursor] === " ") cursor += 1;
    let degree: string | null = null;
    if (input[cursor] === "[") {
      const close = input.indexOf("]", cursor + 1);
      if (close !== -1) {
        degree = convertTexBody(input.slice(cursor + 1, close), depth + 1);
        cursor = close + 1;
        while (input[cursor] === " ") cursor += 1;
      }
    }
    let inner = "";
    if (input[cursor] === "{") {
      const group = readBrace(input, cursor);
      if (!group) {
        out += needle;
        i = after;
        continue;
      }
      inner = convertTexBody(group.inner, depth + 1);
      i = group.end;
    } else if (input[cursor] === "\\") {
      const cmd = /^\\[A-Za-z]+/.exec(input.slice(cursor));
      if (!cmd) {
        out += needle;
        i = after;
        continue;
      }
      inner = convertTexBody(cmd[0], depth + 1);
      i = cursor + cmd[0].length;
    } else if (/[0-9A-Za-z]/.test(input[cursor] ?? "")) {
      inner = input[cursor]!;
      i = cursor + 1;
    } else {
      out += needle;
      i = after;
      continue;
    }
    const body = isSimple(inner) ? inner : `(${inner})`;
    const mark = degree == null ? "" : scriptOf(degree, SUPER, (value) => `^(${value})`);
    out += `${mark}√${body}`;
  }
  return out;
}

function replaceNamedBrace(input: string, command: string, depth: number): string {
  const needle = `\\${command}`;
  let out = "";
  let i = 0;
  while (i < input.length) {
    const idx = input.indexOf(needle, i);
    if (idx === -1) {
      out += input.slice(i);
      break;
    }
    const after = idx + needle.length;
    if (/[A-Za-z]/.test(input[after] ?? "")) {
      out += input.slice(i, after);
      i = after;
      continue;
    }
    let cursor = after;
    while (input[cursor] === " ") cursor += 1;
    if (input[cursor] !== "{") {
      out += input.slice(i, after);
      i = after;
      continue;
    }
    const group = readBrace(input, cursor);
    if (!group) {
      out += input.slice(i, after);
      i = after;
      continue;
    }
    out += input.slice(i, idx);
    out += convertTexBody(group.inner, depth + 1);
    i = group.end;
  }
  return out;
}

function applySymbols(input: string): string {
  let out = input;
  out = out.replace(/\^\s*\\circ(?![A-Za-z])/g, "°");
  out = out.replace(/\\%/g, "%");
  out = out.replace(/\\\$/g, "$");
  for (const [name, symbol] of SYMBOLS) {
    out = out.replace(new RegExp(String.raw`\\${name}(?![A-Za-z])`, "g"), symbol);
  }
  return out;
}

function applySpacing(input: string): string {
  return input
    .replace(/\\qquad(?![A-Za-z])/g, " ")
    .replace(/\\quad(?![A-Za-z])/g, " ")
    .replace(/\\[,;:]/g, " ")
    .replace(/\\!/g, "")
    .replace(/\\ /g, " ");
}

function dropFence(input: string): string {
  return input
    .replace(/\\left(?![A-Za-z])\s*/g, "")
    .replace(/\\right(?![A-Za-z])\s*/g, "");
}

/** Invisible `\left.` / `\right.` after the command itself is gone. */
function dropInvisibleDots(input: string): string {
  return input.replace(/(^|[^0-9A-Za-z.])\.(?=[^0-9A-Za-z.]|$)/g, "$1");
}

function convertTexBody(input: string, depth: number): string {
  if (depth > 8) return input;
  let out = input.replace(/\\dfrac(?![A-Za-z])/g, "\\frac").replace(/\\tfrac(?![A-Za-z])/g, "\\frac");
  for (let pass = 0; pass < 8; pass += 1) {
    const before = out;
    out = replaceNamedBrace(out, "text", depth);
    out = replaceNamedBrace(out, "mathrm", depth);
    out = replaceFrac(out, depth);
    out = replaceSqrt(out, depth);
    if (out === before) break;
  }
  out = applySymbols(out);
  out = dropFence(out);
  out = applySpacing(out);
  out = out.replace(/\\[{]/g, "{").replace(/\\[}]/g, "}");
  out = out.replace(/\{,\}/g, ",");
  out = applyScripts(out);
  out = out.replace(/\\([A-Za-z]+)/g, "$1");
  out = out.replace(/\{([A-Za-z])\}/g, "$1");
  out = out.replace(/\{\}/g, "");
  if (depth > 0) out = dropInvisibleDots(out);
  return out;
}

function findClose(text: string, from: number, close: string): number {
  let index = from;
  while (index < text.length) {
    if (close === "$" && text[index] === "$" && text[index - 1] === "\\") {
      index += 1;
      continue;
    }
    if (text.startsWith(close, index)) return index;
    index += 1;
  }
  return -1;
}

function replaceRegions(input: string): string {
  let out = "";
  let cursor = 0;
  while (cursor < input.length) {
    if (input.startsWith("\\$", cursor)) {
      out += input.slice(cursor, cursor + 2);
      cursor += 2;
      continue;
    }
    const delim = DELIMS.find((item) => input.startsWith(item.open, cursor));
    if (!delim) {
      out += input[cursor];
      cursor += 1;
      continue;
    }
    const contentStart = cursor + delim.open.length;
    const close = findClose(input, contentStart, delim.close);
    if (close === -1) {
      out += input[cursor];
      cursor += 1;
      continue;
    }
    out += convertTexBody(input.slice(contentStart, close).trim(), 1);
    cursor = close + delim.close.length;
  }
  return out;
}

function maskProtected(value: string): { text: string; slots: string[] } {
  const slots: string[] = [];
  const text = value.replace(/https?:\/\/\S+|<[^>]+>/g, (match) => {
    const token = `\u0000${slots.length}\u0000`;
    slots.push(match);
    return token;
  });
  return { text, slots };
}

function unmask(value: string, slots: string[]): string {
  return value.replace(/\u0000(\d+)\u0000/g, (_, index: string) => slots[Number(index)] ?? "");
}

function cleanup(value: string): string {
  return value
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .trim();
}

/** Telegram plain text. Placeholders like `{name}` stay. Delimiters `$` `$$` `\(` `\)` `\[` `\]` go away. */
export function latexToTelegramPlain(value: string): string {
  if (!value) return "";
  const masked = maskProtected(value);
  const regions = replaceRegions(masked.text);
  const commands = convertTexBody(regions, 0);
  return unmask(cleanup(commands), masked.slots);
}

/** School TeX that fits in a bubble, or null when the bot should draw `\begin{…}`. */
export function formulaToPlain(tex: string): string | null {
  const trimmed = tex.trim();
  if (!trimmed || /\\begin\s*\{/.test(trimmed)) return null;
  const plain = latexToTelegramPlain(trimmed);
  return plain || null;
}
