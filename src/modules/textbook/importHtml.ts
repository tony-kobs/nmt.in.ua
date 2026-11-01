import { NodeType, parse, type HTMLElement, type Node, type TextNode } from "node-html-parser";
import { MathMLToLaTeX } from "mathml-to-latex";
import { checkTextbookImage } from "./imageLimits";
import {
  FORMULA_REVIEW,
  IMAGE_REVIEW,
  TABLE_REVIEW,
} from "./importMarkers";
import { ommlToLatex } from "./omml";
import { textbookFormulaError } from "./lint";
import { textbookImageMarkup } from "./templates";

export type ImportSummary = {
  headings: number;
  paragraphs: number;
  lists: number;
  tables: number;
  images: number;
  formulas: number;
  reviewFormulas: number;
  reviewImages: number;
  reviewTables: number;
  numberedAsBullets: boolean;
  deepHeadings: boolean;
};

export type ImportImage = {
  placeholder: string;
  alt: string;
  bytes: Uint8Array;
};

export type ImportDraft = {
  markup: string;
  images: ImportImage[];
  summary: ImportSummary;
};

type Flags = { bold?: true; italic?: true; underline?: true };

type Ctx = {
  chunks: string[];
  images: ImportImage[];
  summary: ImportSummary;
  imageSerial: number;
  tableDepth: number;
};

const BLOCK_TAGS = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "body",
  "center",
  "div",
  "dl",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "html",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "ul",
]);

function emptySummary(): ImportSummary {
  return {
    headings: 0,
    paragraphs: 0,
    lists: 0,
    tables: 0,
    images: 0,
    formulas: 0,
    reviewFormulas: 0,
    reviewImages: 0,
    reviewTables: 0,
    numberedAsBullets: false,
    deepHeadings: false,
  };
}

function isElement(node: Node): node is HTMLElement {
  return node.nodeType === NodeType.ELEMENT_NODE;
}

function isText(node: Node): node is TextNode {
  return node.nodeType === NodeType.TEXT_NODE;
}

function tagName(el: HTMLElement): string {
  return el.tagName.toLowerCase();
}

function hasBlockChild(el: HTMLElement): boolean {
  return el.childNodes.some((child) => isElement(child) && BLOCK_TAGS.has(tagName(child)));
}

function flagsFrom(el: HTMLElement, parent: Flags): Flags {
  const next: Flags = { ...parent };
  const name = tagName(el);
  const style = el.getAttribute("style") ?? "";
  const weight = /font-weight\s*:\s*([^;]+)/i.exec(style)?.[1]?.trim().toLowerCase() ?? "";
  const weightNum = Number(weight);
  const boldOff = weight === "normal" || (Number.isFinite(weightNum) && weightNum > 0 && weightNum < 600);
  const boldOn =
    weight === "bold" || weight === "bolder" || (Number.isFinite(weightNum) && weightNum >= 600);
  if (boldOff) delete next.bold;
  if ((name === "b" || name === "strong" || name === "th") && !boldOff) next.bold = true;
  if (boldOn) next.bold = true;
  if (name === "i" || name === "em" || /font-style\s*:\s*italic/i.test(style)) next.italic = true;
  if (name === "u" || /text-decoration[^;]*underline/i.test(style)) next.underline = true;
  return next;
}

function wrap(text: string, flags: Flags): string {
  if (!text) return "";
  let out = text;
  if (flags.underline) out = `__${out}__`;
  if (flags.italic) out = `*${out}*`;
  if (flags.bold) out = `**${out}**`;
  return out;
}

function escapeOutsideMath(text: string): string {
  let out = "";
  let index = 0;
  while (index < text.length) {
    const display = text.startsWith("\\[", index);
    const inline = text.startsWith("\\(", index);
    if (display || inline) {
      const close = display ? "\\]" : "\\)";
      const end = text.indexOf(close, index + 2);
      if (end === -1) {
        out += text.slice(index).replace(/\*/g, "\\*");
        break;
      }
      out += text.slice(index, end + 2);
      index = end + 2;
      continue;
    }
    out += text[index] === "*" ? "\\*" : text[index];
    index += 1;
  }
  return out;
}

function cleanText(text: string): string {
  return text.replace(/\u00a0/g, " ").replace(/[ \t\f\v]+/g, " ");
}

function escapeStructuralLine(line: string): string {
  if (/^(#{1,2} |- |\||:::|!\[|@(?:left|center|right|both) )/.test(line)) return `\\${line}`;
  return line;
}

function pushChunk(ctx: Ctx, chunk: string) {
  const trimmed = chunk.trim();
  if (!trimmed) return;
  ctx.chunks.push(trimmed);
}

function pushParagraph(ctx: Ctx, text: string, align: string) {
  const body = text.replace(/[ \t]*\n[ \t]*/g, " ").trim();
  if (!body) return;
  if (/^!\[[^\]]*\]\([^)]+\)$/.test(body)) {
    pushChunk(ctx, body);
    return;
  }
  ctx.summary.paragraphs += 1;
  pushChunk(ctx, align + escapeStructuralLine(body));
}

function alignPrefix(el: HTMLElement): string {
  const style = `${el.getAttribute("style") ?? ""} ${el.getAttribute("align") ?? ""}`;
  if (/text-align\s*:\s*center|\bcenter\b/i.test(style)) return "@center ";
  if (/text-align\s*:\s*right|\bright\b/i.test(style)) return "@right ";
  if (/text-align\s*:\s*justify|\bjustify\b/i.test(style)) return "@both ";
  return "";
}

function mathLatex(el: HTMLElement): string | null {
  const annotation = el.querySelector("annotation");
  if (annotation) {
    const encoding = annotation.getAttribute("encoding") ?? "";
    if (/tex/i.test(encoding)) {
      const latex = annotation.text.trim();
      if (latex) return latex.replace(/\s+/g, " ");
    }
  }
  try {
    const latex = MathMLToLaTeX.convert(el.outerHTML).trim().replace(/\s+/g, " ");
    return latex || null;
  } catch {
    return null;
  }
}

function emitMath(el: HTMLElement, display: boolean): string {
  const name = tagName(el);
  const latex =
    name === "math" || name.endsWith(":math") ? mathLatex(el) : ommlToLatex(el.outerHTML);
  if (!latex) return FORMULA_REVIEW;
  return display ? `\\[${latex}\\]` : `\\(${latex}\\)`;
}

function dataUrlBytes(src: string): Uint8Array | null {
  const match = /^data:image\/(?:png|jpeg|jpg|webp|gif);base64,([a-z0-9+/=\s]+)$/i.exec(src.trim());
  if (!match) return null;
  try {
    const binary = atob((match[1] ?? "").replace(/\s/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  } catch {
    return null;
  }
}

function emitImage(el: HTMLElement, ctx: Ctx): string {
  const alt = (el.getAttribute("alt") ?? "").replace(/[\[\]]/g, "").replace(/\s+/g, " ").trim();
  const src = (el.getAttribute("src") ?? "").trim();
  const bytes = dataUrlBytes(src);
  if (bytes && checkTextbookImage(bytes).ok) {
    ctx.imageSerial += 1;
    const placeholder = `pending-import${ctx.imageSerial}`;
    ctx.images.push({ placeholder, alt: alt || "Зображення", bytes });
    return textbookImageMarkup(alt || "Зображення", placeholder);
  }
  if (alt && /[\\^_{}]/.test(alt) && !textbookFormulaError(alt)) return `\\(${alt}\\)`;
  return IMAGE_REVIEW;
}

function renderInline(node: Node, flags: Flags, ctx: Ctx): string {
  if (isText(node)) return wrap(escapeOutsideMath(cleanText(node.text)), flags);
  if (!isElement(node)) return "";
  const el = node;
  const name = tagName(el);
  if (name === "script" || name === "style" || name === "annotation") return "";
  const next = flagsFrom(el, flags);
  if (name === "br") return "\n";
  if (name === "img") return emitImage(el, ctx);
  if (name === "math" || name.endsWith(":math") || name === "omath" || name.endsWith(":omath")) {
    const display = (el.getAttribute("display") ?? "").toLowerCase() === "block";
    return emitMath(el, display);
  }
  if (name === "ul" || name === "ol" || name === "table") return "";
  let out = "";
  for (const child of el.childNodes) out += renderInline(child, next, ctx);
  return out;
}

function inlineText(el: HTMLElement, flags: Flags, ctx: Ctx): string {
  return renderInline(el, flags, ctx).replace(/[ \t]*\n[ \t]*/g, " ").replace(/ {2,}/g, " ").trim();
}

function listLines(list: HTMLElement, flags: Flags, ctx: Ctx): string[] {
  const lines: string[] = [];
  for (const child of list.childNodes) {
    if (!isElement(child) || tagName(child) !== "li") continue;
    const itemFlags = flagsFrom(child, flags);
    const text = inlineText(child, itemFlags, ctx);
    if (text) lines.push(`- ${text}`);
    for (const nested of child.childNodes) {
      if (!isElement(nested)) continue;
      const nestedName = tagName(nested);
      if (nestedName !== "ul" && nestedName !== "ol") continue;
      if (nestedName === "ol") ctx.summary.numberedAsBullets = true;
      ctx.summary.lists += 1;
      lines.push(...listLines(nested, itemFlags, ctx));
    }
  }
  return lines;
}

function rowsOf(table: HTMLElement): HTMLElement[] {
  const rows: HTMLElement[] = [];
  const visit = (el: HTMLElement) => {
    for (const child of el.childNodes) {
      if (!isElement(child)) continue;
      const name = tagName(child);
      if (name === "tr") rows.push(child);
      else if (name === "thead" || name === "tbody" || name === "tfoot") visit(child);
    }
  };
  visit(table);
  return rows;
}

function cellsOf(row: HTMLElement): HTMLElement[] {
  return row.childNodes.filter(
    (child): child is HTMLElement => isElement(child) && (tagName(child) === "td" || tagName(child) === "th"),
  );
}

function capture(ctx: Ctx, run: () => void): string[] {
  const previous = ctx.chunks;
  ctx.chunks = [];
  run();
  const captured = ctx.chunks;
  ctx.chunks = previous;
  return captured;
}

function renderTable(table: HTMLElement, ctx: Ctx, flags: Flags): string {
  const rows = rowsOf(table);
  let columns = 1;
  const rendered = rows.map((row) => {
    const cells = cellsOf(row);
    let spanSum = 0;
    const body = cells.map((cell) => {
      const span = Math.max(1, Number(cell.getAttribute("colspan") ?? "1") || 1);
      spanSum += span;
      const inner = capture(ctx, () => walkBlocks(cell, ctx, flagsFrom(cell, flags)));
      const spanAttr = span > 1 ? ` span=${span}` : "";
      return `:::cell${spanAttr}\n${inner.join("\n\n")}\n:::endcell`;
    });
    columns = Math.max(columns, spanSum, 1);
    return `:::row\n${body.join("\n")}\n:::endrow`;
  });
  const widths = Array.from({ length: columns }, () => 1000).join(",");
  return [`:::table grid widths=${widths}`, ...rendered, ":::endtable"].join("\n");
}

function walkElement(el: HTMLElement, ctx: Ctx, parentFlags: Flags) {
  const name = tagName(el);
  if (name === "script" || name === "style" || name === "head" || name === "annotation") return;
  const flags = flagsFrom(el, parentFlags);
  if (name === "h1" || name === "h2" || name === "h3" || name === "h4" || name === "h5" || name === "h6") {
    const level = Number(name.slice(1));
    if (level > 2) ctx.summary.deepHeadings = true;
    const text = inlineText(el, flags, ctx);
    if (!text) return;
    ctx.summary.headings += 1;
    pushChunk(ctx, `${level === 1 ? "# " : "## "}${text}`);
    return;
  }
  if (name === "ul" || name === "ol") {
    if (name === "ol") ctx.summary.numberedAsBullets = true;
    const lines = listLines(el, flags, ctx);
    if (lines.length === 0) return;
    ctx.summary.lists += 1;
    pushChunk(ctx, lines.join("\n"));
    return;
  }
  if (name === "table") {
    if (ctx.tableDepth > 0) {
      pushChunk(ctx, TABLE_REVIEW);
      return;
    }
    ctx.tableDepth += 1;
    ctx.summary.tables += 1;
    pushChunk(ctx, renderTable(el, ctx, flags));
    ctx.tableDepth -= 1;
    return;
  }
  if (name === "img") {
    pushChunk(ctx, emitImage(el, ctx));
    return;
  }
  if (name === "math" || name.endsWith(":math") || name === "omath" || name.endsWith(":omath")) {
    pushParagraph(ctx, emitMath(el, true), "");
    return;
  }
  if (name === "pre") {
    const text = el.text.replace(/\u00a0/g, " ");
    for (const line of text.split(/\n/)) pushParagraph(ctx, line, "");
    return;
  }
  if (name === "p" || name === "blockquote" || name === "figcaption" || (name === "div" && !hasBlockChild(el)) || name === "li") {
    const raw = renderInline(el, flags, ctx);
    for (const part of raw.split(/\n+/)) pushParagraph(ctx, part, alignPrefix(el));
    return;
  }
  if (hasBlockChild(el) || BLOCK_TAGS.has(name)) {
    walkBlocks(el, ctx, flags);
    return;
  }
  const text = inlineText(el, flags, ctx);
  if (text) pushParagraph(ctx, text, alignPrefix(el));
}

function walkBlocks(el: HTMLElement, ctx: Ctx, flags: Flags) {
  for (const child of el.childNodes) {
    if (isText(child)) {
      const text = cleanText(child.text).trim();
      if (text) pushParagraph(ctx, text, "");
      continue;
    }
    if (isElement(child)) walkElement(child, ctx, flags);
  }
}

export function htmlToTextbookMarkup(html: string): ImportDraft {
  const ctx: Ctx = {
    chunks: [],
    images: [],
    summary: emptySummary(),
    imageSerial: 0,
    tableDepth: 0,
  };
  const root = parse(html);
  walkBlocks(root, ctx, {});
  const markup = ctx.chunks.join("\n\n").trim();
  tallyMarkup(markup, ctx.summary);
  return { markup, images: ctx.images, summary: ctx.summary };
}

function tallyMarkup(markup: string, summary: ImportSummary) {
  summary.formulas = 0;
  summary.reviewFormulas = 0;
  summary.reviewImages = 0;
  summary.reviewTables = 0;
  summary.images = markup.match(/!\[[^\]]*\]\(pending-import\d+\)/g)?.length ?? 0;
  for (const match of markup.matchAll(/\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)/g)) {
    const body = (match[1] ?? match[2] ?? "").trim();
    if (!body) continue;
    if (textbookFormulaError(body)) summary.reviewFormulas += 1;
    else summary.formulas += 1;
  }
  summary.reviewFormulas += markup.match(/⟦формула⟧/g)?.length ?? 0;
  summary.reviewImages += markup.match(/⟦картинка⟧/g)?.length ?? 0;
  summary.reviewTables += markup.match(/⟦таблиця⟧/g)?.length ?? 0;
}

export async function materializeImportImages(
  draft: ImportDraft,
  save: (bytes: Uint8Array) => Promise<{ ok: true; src: string } | { ok: false }>,
): Promise<ImportDraft> {
  let markup = draft.markup;
  let images = draft.summary.images;
  let reviewImages = draft.summary.reviewImages;
  for (const image of draft.images) {
    const token = textbookImageMarkup(image.alt, image.placeholder);
    const saved = await save(image.bytes);
    if (saved.ok) {
      markup = markup.replace(token, textbookImageMarkup(image.alt, saved.src));
      continue;
    }
    markup = markup.replace(token, IMAGE_REVIEW);
    images -= 1;
    reviewImages += 1;
  }
  return {
    markup,
    images: [],
    summary: { ...draft.summary, images: Math.max(0, images), reviewImages },
  };
}
