/**
 * Word equations are OMML (`m:oMath`). Mammoth drops them, so they are
 * rewritten to LaTeX text before the docx becomes HTML. Constructs this
 * walker does not know become a review marker instead of disappearing.
 */

import { FORMULA_REVIEW } from "./importMarkers";

type XmlNode = {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
};

const SKIP = new Set([
  "rpr",
  "ctrlpr",
  "mathpr",
  "argpr",
  "nor",
  "sty",
  "scr",
  "brk",
  "lit",
  "aln",
  "mcjc",
  "mcs",
  "mc",
  "mcpr",
  "count",
  "mpr",
]);

const SYMBOLS: Record<string, string> = {
  "−": "-",
  "–": "-",
  "—": "-",
  "×": "\\times ",
  "·": "\\cdot ",
  "÷": "\\div ",
  "≤": "\\le ",
  "≥": "\\ge ",
  "≠": "\\ne ",
  "≈": "\\approx ",
  "±": "\\pm ",
  "∞": "\\infty ",
  π: "\\pi ",
  α: "\\alpha ",
  β: "\\beta ",
  γ: "\\gamma ",
  Δ: "\\Delta ",
  θ: "\\theta ",
  "→": "\\to ",
  "∈": "\\in ",
  "∑": "\\sum ",
  "∫": "\\int ",
  "∏": "\\prod ",
  "°": "^{\\circ}",
};

const NARY: Record<string, string> = {
  "∑": "\\sum",
  "∫": "\\int",
  "∏": "\\prod",
  "∐": "\\coprod",
};

const FUNCS = new Set(["sin", "cos", "tan", "cot", "ln", "log", "lg", "lim", "exp", "det", "gcd"]);

function localName(raw: string): string {
  const name = raw.trim();
  const colon = name.lastIndexOf(":");
  return (colon === -1 ? name : name.slice(colon + 1)).toLowerCase();
}

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([^\s=]+)\s*=\s*"([^"]*)"/g;
  for (const match of raw.matchAll(re)) {
    attrs[localName(match[1] ?? "")] = match[2] ?? "";
  }
  return attrs;
}

function parseXml(xml: string): XmlNode[] {
  const root: XmlNode = { name: "#root", attrs: {}, children: [], text: "" };
  const stack: XmlNode[] = [root];
  let index = 0;
  while (index < xml.length) {
    if (xml.startsWith("<?", index)) {
      const end = xml.indexOf("?>", index);
      index = end === -1 ? xml.length : end + 2;
      continue;
    }
    if (xml.startsWith("<!--", index)) {
      const end = xml.indexOf("-->", index);
      index = end === -1 ? xml.length : end + 3;
      continue;
    }
    if (xml[index] !== "<") {
      const next = xml.indexOf("<", index);
      const text = xml.slice(index, next === -1 ? xml.length : next);
      const parent = stack[stack.length - 1];
      if (parent && text.trim()) parent.text += text;
      index = next === -1 ? xml.length : next;
      continue;
    }
    const close = xml.indexOf(">", index);
    if (close === -1) break;
    const body = xml.slice(index + 1, close).trim();
    index = close + 1;
    if (!body || body.startsWith("!") || body.startsWith("?")) continue;
    if (body.startsWith("/")) {
      const name = localName(body.slice(1));
      for (let depth = stack.length - 1; depth > 0; depth -= 1) {
        const node = stack[depth];
        stack.pop();
        if (node?.name === name) break;
      }
      continue;
    }
    const empty = body.endsWith("/");
    const head = empty ? body.slice(0, -1).trim() : body;
    const space = head.search(/\s/);
    const name = localName(space === -1 ? head : head.slice(0, space));
    const attrs = parseAttrs(space === -1 ? "" : head.slice(space));
    const node: XmlNode = { name, attrs, children: [], text: "" };
    stack[stack.length - 1]?.children.push(node);
    if (!empty) stack.push(node);
  }
  return root.children;
}

function child(node: XmlNode, name: string): XmlNode | undefined {
  return node.children.find((item) => item.name === name);
}

function attrVal(node: XmlNode, prop: string): string | null {
  const direct = node.children.find((item) => item.name === prop);
  if (direct?.attrs.val !== undefined) return direct.attrs.val;
  for (const item of node.children) {
    if (!item.name.endsWith("pr")) continue;
    const nested = item.children.find((inner) => inner.name === prop);
    if (nested?.attrs.val !== undefined) return nested.attrs.val;
  }
  return null;
}

function mapSymbols(text: string): string | null {
  let out = "";
  let plain = "";
  const flush = (): boolean => {
    if (!plain) return true;
    if (/^[0-9A-Za-z+\-=()[\].,/]+$/.test(plain)) out += plain;
    else out += `\\text{${plain.replace(/[{}\\]/g, "")}}`;
    plain = "";
    return true;
  };
  for (const char of text) {
    const symbol = SYMBOLS[char];
    if (symbol) {
      if (!flush()) return null;
      out += symbol;
      continue;
    }
    if (char === " " || char === "\n" || char === "\t") {
      if (!flush()) return null;
      out += " ";
      continue;
    }
    plain += char;
  }
  if (!flush()) return null;
  return out;
}

function joinChildren(node: XmlNode): string | null {
  let out = "";
  for (const item of node.children) {
    if (SKIP.has(item.name)) continue;
    const part = convertNode(item);
    if (part === null) return null;
    out += part;
  }
  if (node.text) {
    const text = mapSymbols(node.text);
    if (text === null) return null;
    out += text;
  }
  return out;
}

function brace(body: string): string {
  if (!body) return "{}";
  if (/^[0-9A-Za-z]$/.test(body)) return body;
  return `{${body}}`;
}

function texDelim(value: string): string {
  if (value === "{" || value === "}") return `\\${value}`;
  if (value === "") return ".";
  if (/^[()[\]|]$/.test(value)) return value;
  return `|`;
}

function convertNode(node: XmlNode): string | null {
  if (SKIP.has(node.name)) return "";
  if (node.name === "t") return mapSymbols(node.text);
  if (node.name === "r" || node.name === "e" || node.name === "num" || node.name === "den") {
    return joinChildren(node);
  }
  if (node.name === "sup" || node.name === "sub" || node.name === "deg" || node.name === "fname") {
    return joinChildren(node);
  }
  if (node.name === "f") {
    const num = child(node, "num");
    const den = child(node, "den");
    if (!num || !den) return null;
    const top = convertNode(num);
    const bottom = convertNode(den);
    if (top === null || bottom === null) return null;
    return `\\frac{${top}}{${bottom}}`;
  }
  if (node.name === "ssup" || node.name === "ssub" || node.name === "ssubsup") {
    const baseNode = child(node, "e");
    if (!baseNode) return null;
    const base = convertNode(baseNode);
    if (base === null) return null;
    let out = brace(base);
    if (node.name !== "ssup") {
      const sub = child(node, "sub");
      const subText = sub ? convertNode(sub) : "";
      if (subText === null) return null;
      if (subText) out += `_{${subText}}`;
    }
    if (node.name !== "ssub") {
      const sup = child(node, "sup");
      const supText = sup ? convertNode(sup) : "";
      if (supText === null) return null;
      if (supText) out += `^{${supText}}`;
    }
    return out;
  }
  if (node.name === "rad") {
    const bodyNode = child(node, "e");
    if (!bodyNode) return null;
    const body = convertNode(bodyNode);
    if (body === null) return null;
    const hidden = attrVal(node, "deghide") === "1" || attrVal(node, "deghide") === "on";
    const degree = child(node, "deg");
    const deg = degree ? convertNode(degree) : "";
    if (deg === null) return null;
    if (!hidden && deg.trim()) return `\\sqrt[${deg}]{${body}}`;
    return `\\sqrt{${body}}`;
  }
  if (node.name === "d") {
    const bodyNode = child(node, "e");
    if (!bodyNode) return null;
    const body = convertNode(bodyNode);
    if (body === null) return null;
    const begin = attrVal(node, "begchr") ?? "(";
    const end = attrVal(node, "endchr") ?? ")";
    return `\\left${texDelim(begin)}${body}\\right${texDelim(end)}`;
  }
  if (node.name === "nary") {
    const chr = attrVal(node, "chr") ?? "∑";
    const command = NARY[chr];
    if (!command) return null;
    const bodyNode = child(node, "e");
    const body = bodyNode ? convertNode(bodyNode) : "";
    if (body === null) return null;
    const subNode = child(node, "sub");
    const supNode = child(node, "sup");
    const sub = subNode ? convertNode(subNode) : "";
    const sup = supNode ? convertNode(supNode) : "";
    if (sub === null || sup === null) return null;
    return `${command}${sub ? `_{${sub}}` : ""}${sup ? `^{${sup}}` : ""} ${body}`.trim();
  }
  if (node.name === "func") {
    const nameNode = child(node, "fname");
    const bodyNode = child(node, "e");
    if (!nameNode || !bodyNode) return null;
    const name = convertNode(nameNode);
    const body = convertNode(bodyNode);
    if (name === null || body === null) return null;
    const clean = name.replace(/\\text\{([^}]*)\}/g, "$1").trim();
    const command = FUNCS.has(clean) ? `\\${clean}` : `\\operatorname{${clean}}`;
    return `${command} ${body}`.trim();
  }
  if (node.name === "m") {
    const rows = node.children.filter((item) => item.name === "mr");
    if (rows.length === 0) return null;
    const lines: string[] = [];
    for (const row of rows) {
      const cells: string[] = [];
      for (const cell of row.children) {
        if (cell.name !== "e") continue;
        const value = convertNode(cell);
        if (value === null) return null;
        cells.push(value);
      }
      lines.push(cells.join(" & "));
    }
    return `\\begin{matrix} ${lines.join(" \\\\ ")} \\end{matrix}`;
  }
  if (node.name === "omath" || node.name === "omathpara") return joinChildren(node);
  return null;
}

function findMath(nodes: readonly XmlNode[], found: XmlNode[]) {
  for (const node of nodes) {
    if (node.name === "omath") found.push(node);
    else findMath(node.children, found);
  }
}

/** LaTeX for one OMML fragment, or null when a construct is not supported. */
export function ommlToLatex(xml: string): string | null {
  const nodes = parseXml(xml);
  const found: XmlNode[] = [];
  findMath(nodes, found);
  const targets = found.length > 0 ? found : nodes;
  if (targets.length === 0) return null;
  const parts: string[] = [];
  for (const node of targets) {
    const latex = convertNode(node);
    if (latex === null) return null;
    const trimmed = latex.replace(/\s+/g, " ").trim();
    if (!trimmed) return null;
    parts.push(trimmed);
  }
  return parts.join(" ").trim() || null;
}

function escapeXml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function wordRun(text: string): string {
  return `<w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>`;
}

function wordParagraph(text: string): string {
  return `<w:p>${wordRun(text)}</w:p>`;
}

type TagHit = { start: number; end: number; innerStart: number; prefix: string; empty: boolean };

function readOpen(xml: string, local: string, from: number): TagHit | null {
  const re = new RegExp(`<((?:[A-Za-z0-9]+:)?)${local}(?=[\\s>/])`, "g");
  re.lastIndex = from;
  const match = re.exec(xml);
  if (!match || match.index === undefined) return null;
  const start = match.index;
  const close = xml.indexOf(">", start);
  if (close === -1) return null;
  const empty = xml[close - 1] === "/";
  return {
    start,
    end: close + 1,
    innerStart: close + 1,
    prefix: (match[1] ?? "").replace(/:$/, ""),
    empty,
  };
}

function findBalancedEnd(xml: string, local: string, prefix: string, innerStart: number): number {
  const token = prefix ? `${prefix}:${local}` : local;
  let depth = 1;
  let index = innerStart;
  while (index < xml.length) {
    const next = xml.indexOf("<", index);
    if (next === -1) return -1;
    if (xml.startsWith(`</${token}>`, next) || xml.startsWith(`</${token} `, next)) {
      depth -= 1;
      const close = xml.indexOf(">", next);
      if (close === -1) return -1;
      if (depth === 0) return close + 1;
      index = close + 1;
      continue;
    }
    if (xml.startsWith(`<${token}`, next) && /[\s>/]/.test(xml[next + token.length + 1] ?? "")) {
      const close = xml.indexOf(">", next);
      if (close === -1) return -1;
      if (xml[close - 1] !== "/") depth += 1;
      index = close + 1;
      continue;
    }
    index = next + 1;
  }
  return -1;
}

function replaceBalanced(
  xml: string,
  local: string,
  replacer: (inner: string, raw: string) => string,
): string {
  let out = "";
  let index = 0;
  while (index < xml.length) {
    const open = readOpen(xml, local, index);
    if (!open) {
      out += xml.slice(index);
      break;
    }
    out += xml.slice(index, open.start);
    if (open.empty) {
      out += replacer("", xml.slice(open.start, open.end));
      index = open.end;
      continue;
    }
    const end = findBalancedEnd(xml, local, open.prefix, open.innerStart);
    if (end === -1) {
      out += xml.slice(open.start);
      break;
    }
    const closeLen = `</${open.prefix ? `${open.prefix}:` : ""}${local}>`.length;
    const inner = xml.slice(open.innerStart, end - closeLen);
    out += replacer(inner, xml.slice(open.start, end));
    index = end;
  }
  return out;
}

function latexMarkup(xml: string, display: boolean): string {
  const latex = ommlToLatex(xml);
  if (!latex) return FORMULA_REVIEW;
  return display ? `\\[${latex}\\]` : `\\(${latex}\\)`;
}

/**
 * Turn equation islands into ordinary Word text runs so mammoth keeps them.
 * A fallback picture inside `AlternateContent` is dropped: the LaTeX (or the
 * review marker) is the copy that stays.
 */
export function replaceWordMath(xml: string): string {
  const withoutFallback = replaceBalanced(xml, "AlternateContent", (inner, raw) => {
    if (!/oMath/.test(inner)) return raw;
    const display = /oMathPara/.test(inner);
    const text = latexMarkup(inner, display);
    return display ? wordParagraph(text) : wordRun(text);
  });
  const withoutParagraphs = replaceBalanced(withoutFallback, "oMathPara", (inner) =>
    wordParagraph(latexMarkup(inner, true)),
  );
  return replaceBalanced(withoutParagraphs, "oMath", (inner) => wordRun(latexMarkup(inner, false)));
}
