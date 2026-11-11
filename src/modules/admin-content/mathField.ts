import { parseMathText } from "@/components/ui/MathText/parseMathText";

/**
 * Quiz bank stores KaTeX as `$…$` for MathText.
 * Admin edits plain symbols; we convert both ways.
 */

const WHOLE_INLINE = /^\$([^$]*)\$$/;

/** Remove every math delimiter, keep formula contents. */
export function stripMathDelimiters(value: string): string {
  if (!value) return "";
  return parseMathText(value)
    .map((part) => part.content)
    .join("");
}

/** Read `{…}` after `openIdx` pointing at `{`. Returns inner + index after `}`. */
function readBraceGroup(
  input: string,
  openIdx: number,
): { inner: string; end: number } | null {
  if (input[openIdx] !== "{") return null;
  let depth = 0;
  for (let i = openIdx; i < input.length; i += 1) {
    const ch = input[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return { inner: input.slice(openIdx + 1, i), end: i + 1 };
      }
    }
  }
  return null;
}

function replaceCmdBraces(
  input: string,
  command: string,
  replacer: (inner: string) => string,
): string {
  const needle = `\\${command}{`;
  let out = "";
  let i = 0;
  while (i < input.length) {
    const idx = input.indexOf(needle, i);
    if (idx === -1) {
      out += input.slice(i);
      break;
    }
    out += input.slice(i, idx);
    const group = readBraceGroup(input, idx + needle.length - 1);
    if (!group) {
      out += needle;
      i = idx + needle.length;
      continue;
    }
    out += replacer(group.inner);
    i = group.end;
  }
  return out;
}

/** TeX `\frac` args: `{…}` or a single digit/letter (`\frac12`, `\frac7{12}`). */
function readFracArg(
  input: string,
  i: number,
): { value: string; end: number } | null {
  if (i >= input.length) return null;
  if (input[i] === "{") {
    const group = readBraceGroup(input, i);
    return group ? { value: group.inner, end: group.end } : null;
  }
  const ch = input[i]!;
  if (/[0-9A-Za-z]/.test(ch)) {
    return { value: ch, end: i + 1 };
  }
  return null;
}

function replaceFrac(input: string): string {
  const needle = "\\frac";
  let out = "";
  let i = 0;
  while (i < input.length) {
    const idx = input.indexOf(needle, i);
    if (idx === -1) {
      out += input.slice(i);
      break;
    }
    // Avoid matching longer names if any appear later.
    const after = idx + needle.length;
    if (/[a-zA-Z]/.test(input[after] ?? "")) {
      out += input.slice(i, after);
      i = after;
      continue;
    }
    out += input.slice(i, idx);
    const first = readFracArg(input, after);
    if (!first) {
      out += needle;
      i = after;
      continue;
    }
    const second = readFracArg(input, first.end);
    if (!second) {
      out += input.slice(idx, first.end);
      i = first.end;
      continue;
    }
    const left = first.value.trim();
    const right = second.value.trim();
    // Only bare numbers/letters skip parentheses — never "3-x" or "a+3".
    const simple =
      /^[0-9A-Za-z]+$/.test(left) && /^[0-9A-Za-z]+$/.test(right);
    const body = simple ? `${left}/${right}` : `(${left})/(${right})`;
    // Mixed number: 1\frac12 → "1 1/2"; also \arctan\frac{x}{2} → "arctan x/2"
    const prev = out[out.length - 1];
    if (prev && /[0-9A-Za-z]/.test(prev)) {
      out += ` ${body}`;
    } else {
      out += body;
    }
    i = second.end;
  }
  return out;
}

/** `\sqrt{…}` or bare `\sqrt2`. */
function replaceSqrt(input: string): string {
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
    if (/[a-zA-Z]/.test(input[after] ?? "")) {
      out += input.slice(i, after);
      i = after;
      continue;
    }
    out += input.slice(i, idx);
    // Optional [n] root degree — keep plain as √[n](…)
    let cursor = after;
    while (input[cursor] === " ") cursor += 1;

    let degree: string | null = null;
    if (input[cursor] === "[") {
      const close = input.indexOf("]", cursor + 1);
      if (close !== -1) {
        degree = input.slice(cursor + 1, close);
        cursor = close + 1;
        while (input[cursor] === " ") cursor += 1;
      }
    }

    let inner: string;
    if (input[cursor] === "{") {
      const group = readBraceGroup(input, cursor);
      if (!group) {
        out += needle;
        i = after;
        continue;
      }
      inner = group.inner;
      i = group.end;
    } else if (input[cursor] === "\\") {
      // \sqrt\pi or \sqrt\alpha
      const cmd = input.slice(cursor).match(/^\\[a-zA-Z]+/);
      if (!cmd) {
        out += needle;
        i = after;
        continue;
      }
      inner = cmd[0]!;
      i = cursor + cmd[0]!.length;
      if (input[i] === "{") {
        const group = readBraceGroup(input, i);
        if (group) {
          inner += input.slice(i, group.end);
          i = group.end;
        }
      }
    } else if (/[0-9A-Za-z]/.test(input[cursor] ?? "")) {
      inner = input[cursor]!;
      i = cursor + 1;
    } else {
      out += needle;
      i = after;
      continue;
    }

    // Light-convert inner commands so \sqrt\pi → √π
    let pretty = inner;
    pretty = pretty.replace(/\\pi(?![a-zA-Z])/g, "π");
    for (const [cmd, symbol] of Object.entries(GREEK_TO_PLAIN)) {
      pretty = pretty.replace(
        new RegExp(String.raw`\\${cmd}(?![a-zA-Z])`, "g"),
        symbol,
      );
    }

    if (degree) {
      out += `√[${degree}](${pretty})`;
    } else if (/^[0-9]+(?:\{,\}[0-9]+)?$/.test(pretty.trim())) {
      out += `√${pretty.trim()}`;
    } else if (/^[0-9A-Za-zπσαβγδωΩ]+$/.test(pretty.trim())) {
      out += `√${pretty.trim()}`;
    } else {
      out += `√(${pretty})`;
    }
  }
  return out;
}

const GREEK_TO_PLAIN: Record<string, string> = {
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  pi: "π",
  sigma: "σ",
  Omega: "Ω",
  omega: "ω",
};

const PLAIN_TO_GREEK: Record<string, string> = Object.fromEntries(
  Object.entries(GREEK_TO_PLAIN).map(([k, v]) => [v, k]),
);

const TEX_FUN_NAMES =
  "arcsin|arccos|arctan|sin|cos|tan|cot|sec|csc|log|ln|lim";

/**
 * Strip `\sin` → `sin`, inserting a space when glued to a prior letter
 * (`\cdot\cos` → `\cdot cos`, not `\cdotcos`).
 */
function stripTexFunctions(input: string): string {
  return input.replace(
    new RegExp(String.raw`\\(${TEX_FUN_NAMES})(?![a-zA-Z])`, "g"),
    (full, name: string, offset: number, src: string) => {
      const prev = offset > 0 ? src[offset - 1]! : "";
      // Keep `\cdot\cos` / `2\sin` / `}\arctan` from gluing into one token.
      if (prev && /[A-Za-z0-9·×÷±})\]|]/.test(prev)) {
        return ` ${name}`;
      }
      return name;
    },
  );
}

/**
 * Bank → admin form: strip `$…$` and TeX commands → plain symbols.
 */
export function toAdminInput(value: string): string {
  let out = stripMathDelimiters(value);
  if (!out) return "";

  // Nested structures first (multiple passes for nested frac/sqrt).
  for (let pass = 0; pass < 8; pass += 1) {
    const before = out;
    // Functions before frac so \arctan\frac{x}{2} → arctan… not \arctanx…
    out = stripTexFunctions(out);
    out = replaceFrac(out);
    out = replaceSqrt(out);
    out = replaceCmdBraces(out, "overline", (inner) => `${inner}̅`);
    out = replaceCmdBraces(out, "bar", (inner) => `${inner}̄`);
    out = replaceCmdBraces(out, "text", (inner) => inner);
    out = replaceCmdBraces(out, "mathrm", (inner) => inner);
    out = replaceCmdBraces(out, "mathbb", (inner) => {
      const map: Record<string, string> = {
        R: "ℝ",
        N: "ℕ",
        Z: "ℤ",
        Q: "ℚ",
        C: "ℂ",
      };
      return map[inner.trim()] ?? inner;
    });
    if (out === before) break;
  }

  // Sizing / fences — drop, keep the delimiter itself.
  out = out.replace(/\\left(?![a-zA-Z])/g, "");
  out = out.replace(/\\right(?![a-zA-Z])/g, "");
  out = out.replace(/\\Big(?![a-zA-Z])/g, "");
  out = out.replace(/\\big(?![a-zA-Z])/g, "");

  // Degree: 68^\circ or ^\circ → °
  out = out.replace(/\^\s*\\circ(?![a-zA-Z])/g, "°");
  out = out.replace(/\\circ(?![a-zA-Z])/g, "°");

  // Operators / relations / sets
  out = out.replace(/\\cdot(?![a-zA-Z])/g, "·");
  out = out.replace(/\\times(?![a-zA-Z])/g, "×");
  out = out.replace(/\\div(?![a-zA-Z])/g, "÷");
  out = out.replace(/\\pm(?![a-zA-Z])/g, "±");
  out = out.replace(/\\leqslant(?![a-zA-Z])|\\leq(?![a-zA-Z])|\\le(?![a-zA-Z])/g, "≤");
  out = out.replace(/\\geqslant(?![a-zA-Z])|\\geq(?![a-zA-Z])|\\ge(?![a-zA-Z])/g, "≥");
  out = out.replace(/\\neq(?![a-zA-Z])|\\ne(?![a-zA-Z])/g, "≠");
  out = out.replace(/\\approx(?![a-zA-Z])/g, "≈");
  out = out.replace(/\\sim(?![a-zA-Z])/g, "∼");
  out = out.replace(/\\infty(?![a-zA-Z])/g, "∞");
  out = out.replace(/\\emptyset(?![a-zA-Z])/g, "∅");
  out = out.replace(/\\angle(?![a-zA-Z])\s*/g, "∠");
  out = out.replace(/\\parallel(?![a-zA-Z])\s*/g, "∥");
  out = out.replace(/\\perp(?![a-zA-Z])\s*/g, "⊥");
  out = out.replace(/\\cup(?![a-zA-Z])\s*/g, "∪");
  out = out.replace(/\\cap(?![a-zA-Z])\s*/g, "∩");
  out = out.replace(/\\subseteq(?![a-zA-Z])|\\subset(?![a-zA-Z])\s*/g, "⊂");
  out = out.replace(/\\in(?![a-zA-Z])\s*/g, "∈");
  out = out.replace(/\\Rightarrow(?![a-zA-Z])\s*/g, "⇒");
  out = out.replace(/\\to(?![a-zA-Z])\s*/g, "→");
  out = out.replace(/\\int(?![a-zA-Z])\s*/g, "∫");
  out = out.replace(/\\sum(?![a-zA-Z])\s*/g, "∑");

  // Greek
  for (const [cmd, symbol] of Object.entries(GREEK_TO_PLAIN)) {
    out = out.replace(
      new RegExp(String.raw`\\${cmd}(?![a-zA-Z])`, "g"),
      (_full, offset: number, src: string) => {
        const prev = offset > 0 ? src[offset - 1]! : "";
        // cos\alpha → "cos α", but 6\pi stays "6π"
        if (prev && /[A-Za-z·×÷±})\]|]/.test(prev)) {
          return ` ${symbol}`;
        }
        return symbol;
      },
    );
  }

  // Function names already handled in the loop above; catch any leftovers.
  out = stripTexFunctions(out);

  out = out.replace(/\\%/g, "%");
  out = out.replace(/(\d)\{,\}(\d)/g, "$1,$2");

  // Logarithm subscript: log_2 8 stays as log_2 8 (already without backslash)

  return out;
}

/** @deprecated — use toAdminInput */
export function unwrapMathForEdit(value: string): string {
  return toAdminInput(value);
}

/**
 * Admin form → bank TeX (without `$…$` wrappers).
 */
export function fromAdminPlainText(value: string): string {
  let out = value;
  if (!out) return "";

  // Ukrainian decimal comma between digits
  out = out.replace(/(\d),(\d)/g, "$1{,}$2");

  // Square roots: √(…) then √number
  out = (() => {
    let result = "";
    let i = 0;
    while (i < out.length) {
      if (out[i] === "√" && out[i + 1] === "(") {
        let depth = 0;
        let j = i + 1;
        for (; j < out.length; j += 1) {
          if (out[j] === "(") depth += 1;
          else if (out[j] === ")") {
            depth -= 1;
            if (depth === 0) {
              j += 1;
              break;
            }
          }
        }
        const inner = out.slice(i + 2, j - 1);
        result += `\\sqrt{${inner}}`;
        i = j;
        continue;
      }
      result += out[i];
      i += 1;
    }
    return result;
  })();
  out = out.replace(/√(\d+(?:\{,\}\d+)?)/g, "\\sqrt{$1}");

  // Degree
  out = out.replace(/°/g, "^\\circ");

  // Blackboard bold
  out = out.replace(/ℝ/g, "\\mathbb{R}");
  out = out.replace(/ℕ/g, "\\mathbb{N}");
  out = out.replace(/ℤ/g, "\\mathbb{Z}");
  out = out.replace(/ℚ/g, "\\mathbb{Q}");
  out = out.replace(/ℂ/g, "\\mathbb{C}");

  // Combining overline/bar on a single char → \overline / \bar
  out = out.replace(/([A-Za-zΑ-ω])̅/g, "\\overline{$1}");
  out = out.replace(/([A-Za-zΑ-ω])̄/g, "\\bar{$1}");

  // Fractions written as (a)/(b)
  out = out.replace(/\(([^()]+)\)\s*\/\s*\(([^()]+)\)/g, "\\frac{$1}{$2}");

  // Mixed number "1 1/2" → 1\frac{1}{2}
  out = out.replace(
    /(\d)\s+(\d+(?:\{,\}\d+)?)\s*\/\s*(\d+(?:\{,\}\d+)?)/g,
    "$1\\frac{$2}{$3}",
  );

  // Multiplication
  out = out.replace(/\s*[·×]\s*/g, " \\cdot ");
  out = out.replace(/(\d|\))\s*\*\s*(\d|\(|-|\\)/g, "$1 \\cdot $2");
  out = out.replace(/ {2,}/g, " ");
  out = out.replace(/^ /g, "").replace(/ $/g, "");

  out = out.replace(/÷/g, "\\div");
  out = out.replace(/±/g, "\\pm");
  out = out.replace(/≤/g, "\\leqslant");
  out = out.replace(/≥/g, "\\geqslant");
  out = out.replace(/≠/g, "\\neq");
  out = out.replace(/≈/g, "\\approx");
  out = out.replace(/∼/g, "\\sim");
  out = out.replace(/∞/g, "\\infty");
  out = out.replace(/∅/g, "\\emptyset");
  out = out.replace(/∠/g, "\\angle ");
  out = out.replace(/∥/g, "\\parallel ");
  out = out.replace(/⊥/g, "\\perp ");
  out = out.replace(/∪/g, "\\cup ");
  out = out.replace(/∩/g, "\\cap ");
  out = out.replace(/⊂/g, "\\subset ");
  out = out.replace(/∈/g, "\\in ");
  out = out.replace(/⇒/g, "\\Rightarrow ");
  out = out.replace(/→/g, "\\to ");
  out = out.replace(/∫/g, "\\int ");
  out = out.replace(/∑/g, "\\sum ");

  for (const [symbol, cmd] of Object.entries(PLAIN_TO_GREEK)) {
    out = out.replaceAll(symbol, `\\${cmd}`);
  }

  // Function names → TeX (avoid matching inside words)
  out = out.replace(
    /(?<![A-Za-z\\])(arcsin|arccos|arctan|sin|cos|tan|cot|sec|csc|log|ln|lim)(?![A-Za-z])/g,
    "\\$1",
  );

  // Bare percent → \%
  out = out.replace(/(?<!\\)%/g, "\\%");

  // Simple n/m → \frac{n}{m} (when not already \frac)
  out = out.replace(
    /(?<![\d.}\\])(\d+(?:\{,\}\d+)?)\s*\/\s*(\d+(?:\{,\}\d+)?)(?![\d.{])/g,
    "\\frac{$1}{$2}",
  );

  return out;
}

function hasProseLetters(value: string): boolean {
  const probe = value
    .replace(/\\[a-zA-Z]+/g, "")
    .replace(/\\[,;!%]/g, "")
    .replace(/[·×÷±≤≥≠≈∼∞∅∠∥⊥∪∩⊂∈⇒→∫∑√°πσαβγδωΩ̅̄]/g, "")
    .replace(
      /\b(?:arcsin|arccos|arctan|sin|cos|tan|cot|sec|csc|log|ln|lim)\b/g,
      "",
    );
  return /[A-Za-zА-Яа-яІіЇїЄєҐґ]/.test(probe);
}

/** True when the value is safe to treat as a single KaTeX formula. */
export function looksLikeMath(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (hasProseLetters(trimmed)) return false;

  if (/^-?\d+(?:[.,]\d+)?$/.test(trimmed)) return true;
  if (/\\[a-zA-Z%]+/.test(trimmed)) return true;
  if (/[·×÷±≤≥≠≈∼∞∅∠∥⊥∪∩⊂∈⇒→∫∑√°π]/.test(trimmed)) return true;
  if (/\d/.test(trimmed) && /[+\-*/^=<>(){}.,]/.test(trimmed)) return true;

  return false;
}

/** Ensure a short answer field is stored in MathText form. */
export function wrapMathForStorage(value: string): string {
  const stripped = stripMathDelimiters(value).trim();
  if (!stripped) return "";

  if (hasProseLetters(stripped)) {
    return wrapRichTextForStorage(stripped);
  }

  if (WHOLE_INLINE.test(value.trim())) {
    return `$${fromAdminPlainText(toAdminInput(value))}$`;
  }

  const texified = fromAdminPlainText(stripped);
  if (!looksLikeMath(texified) && !/\\/.test(texified)) {
    return texified;
  }

  return `$${texified}$`;
}

const MATH_ATOM =
  String.raw`(?:\\[a-zA-Z%]+(?:\s*(?:\{[^}]*\}|\[[^\]]*\]))*|\\[,;!%]|[A-Za-zπσαβγδωΩℝℕℤℚℂ](?:_[0-9A-Za-z]+)?|-?\d+(?:\{,\}[0-9]+|[.,]\d+)?|[+\-*/^=<>(){}]|\\%|[·×÷±≤≥≠≈∼∞∅∠∥⊥∪∩⊂∈⇒→∫∑√°]|√(?:\[[^\]]*\])?(?:\([^)]*\)|\d+))`;

const MATH_RUN = new RegExp(
  String.raw`${MATH_ATOM}(?:(?:\s|~)*${MATH_ATOM})*`,
  "g",
);

/**
 * Wrap math islands inside prose for task_text / comments.
 */
export function wrapRichTextForStorage(value: string): string {
  const plain = stripMathDelimiters(value);
  if (!plain.trim()) return "";

  const texified = fromAdminPlainText(plain);

  if (!hasProseLetters(plain) && looksLikeMath(plain.trim())) {
    return `$${fromAdminPlainText(plain.trim())}$`;
  }

  return texified.replace(MATH_RUN, (match) => {
    const chunk = match.trim();
    if (!chunk) return match;
    if (!/\d/.test(chunk) && !/\\/.test(chunk) && !/[√π∞°]/.test(chunk)) {
      return match;
    }
    const leading = match.match(/^\s*/)?.[0] ?? "";
    const trailing = match.match(/\s*$/)?.[0] ?? "";
    return `${leading}$${chunk}$${trailing}`;
  });
}

/** @deprecated */
export function previewMathStorage(value: string): string {
  return wrapMathForStorage(value);
}

/** Remaining TeX command names after toAdminInput (for audits/tests). */
export function remainingTexCommands(value: string): string[] {
  const plain = toAdminInput(value);
  const found = new Set<string>();
  for (const m of plain.matchAll(/\\([a-zA-Z]+)/g)) {
    found.add(m[1]!);
  }
  return [...found].sort();
}
