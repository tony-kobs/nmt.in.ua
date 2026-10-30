import type {
  MaterialContentBlock,
  MaterialParagraphBlock,
  MaterialTableBlock,
  MaterialTextRun,
} from "@/content/learningMaterials/sourceBlocks";
import { parseBankTaskLine } from "./bankTask";

type InlineFlags = {
  bold?: true;
  italic?: true;
  underline?: true;
};

const GRAPH_COLUMNS = 12;
const GRAPH_ROWS = 12;

function flagsRun(text: string, flags: InlineFlags, math?: true): MaterialTextRun {
  const run: MaterialTextRun = { text };
  if (flags.bold) run.bold = true;
  if (flags.italic) run.italic = true;
  if (flags.underline) run.underline = true;
  if (math) run.math = true;
  return run;
}

export function parseInline(text: string, flags: InlineFlags = {}): MaterialTextRun[] {
  const runs: MaterialTextRun[] = [];
  let plain = "";
  const pushPlain = () => {
    if (plain === "") return;
    runs.push(flagsRun(plain, flags));
    plain = "";
  };

  let index = 0;
  while (index < text.length) {
    const rest = text.slice(index);
    if (rest.startsWith("\\\\")) {
      plain += "\\";
      index += 2;
      continue;
    }
    if (rest.startsWith("\\*")) {
      plain += "*";
      index += 2;
      continue;
    }
    if (rest.startsWith("\\[")) {
      const end = text.indexOf("\\]", index + 2);
      if (end !== -1) {
        pushPlain();
        runs.push(flagsRun(text.slice(index, end + 2), flags, true));
        index = end + 2;
        continue;
      }
    }
    if (rest.startsWith("\\(")) {
      const end = text.indexOf("\\)", index + 2);
      if (end !== -1) {
        pushPlain();
        runs.push(flagsRun(text.slice(index, end + 2), flags, true));
        index = end + 2;
        continue;
      }
    }
    if (rest.startsWith("**")) {
      const end = text.indexOf("**", index + 2);
      if (end !== -1) {
        pushPlain();
        runs.push(...parseInline(text.slice(index + 2, end), { ...flags, bold: true }));
        index = end + 2;
        continue;
      }
    }
    if (rest.startsWith("__")) {
      const end = text.indexOf("__", index + 2);
      if (end !== -1) {
        pushPlain();
        runs.push(
          ...parseInline(text.slice(index + 2, end), { ...flags, underline: true }),
        );
        index = end + 2;
        continue;
      }
    }
    if (rest.startsWith("*")) {
      const end = text.indexOf("*", index + 1);
      if (end !== -1) {
        pushPlain();
        runs.push(...parseInline(text.slice(index + 1, end), { ...flags, italic: true }));
        index = end + 1;
        continue;
      }
    }
    plain += text[index];
    index += 1;
  }

  pushPlain();
  return runs;
}

function escapePlain(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\*/g, "\\*");
}

function mergePlainRuns(runs: MaterialTextRun[]): MaterialTextRun[] {
  const merged: MaterialTextRun[] = [];
  for (const run of runs) {
    const previous = merged[merged.length - 1];
    if (
      previous &&
      !previous.math &&
      !run.math &&
      previous.bold === run.bold &&
      previous.italic === run.italic &&
      previous.underline === run.underline
    ) {
      previous.text += run.text;
      continue;
    }
    merged.push({ ...run });
  }
  return merged;
}

function styleOf(run: MaterialTextRun): string {
  return `${run.bold ? "b" : ""}${run.italic ? "i" : ""}${run.underline ? "u" : ""}`;
}

function runsToInline(runs: MaterialTextRun[]): string {
  let out = "";
  let open = "";
  const close = () => {
    if (open.includes("u")) out += "__";
    if (open.includes("i")) out += "*";
    if (open.includes("b")) out += "**";
    open = "";
  };
  const setOpen = (next: string) => {
    if (next === open) return;
    close();
    if (next.includes("b")) out += "**";
    if (next.includes("i")) out += "*";
    if (next.includes("u")) out += "__";
    open = next;
  };

  for (const run of mergePlainRuns(runs)) {
    setOpen(styleOf(run));
    if (run.math) {
      const text = run.text.trim();
      out += text.startsWith("\\[") || text.startsWith("\\(") ? text : `\\(${text}\\)`;
    } else {
      out += escapePlain(run.text.replace(/\u00a0/g, " "));
    }
  }
  close();
  return out;
}

type Align = "left" | "center" | "right" | "both";

function paragraphLine(block: MaterialParagraphBlock): string {
  const inline = runsToInline(block.runs).replace(/[ \t]*\n[ \t]*/g, " ");
  if (!inline.trim()) return "";
  let core = inline;
  if (block.variant === "sectionHeading") core = `# ${inline}`;
  else if (block.variant === "subheading") core = `## ${inline}`;
  else if (block.variant === "listItem") core = `- ${inline}`;
  else core = escapeStructuralLine(inline);
  return `@${block.align} ${core}`;
}

function escapeStructuralLine(line: string): string {
  if (/^(#{1,2} |- |\||:::|!\[|@(?:left|center|right|both) )/.test(line)) {
    return `\\${line}`;
  }
  return line;
}

function imageLine(alt: string, src: string): string {
  const safeAlt = alt.replace(/[\[\]]/g, "");
  return `![${safeAlt}](${src})`;
}

function serializeTable(block: MaterialTableBlock): string[] {
  if (block.variant === "graphPaper") {
    const cols = block.columnWidths.length || GRAPH_COLUMNS;
    const rows = block.rows.length || GRAPH_ROWS;
    const width = block.columnWidths[0] ?? 284;
    return [`:::paper ${rows} ${cols} ${width}`];
  }

  const flags = [block.variant === "layout" ? "layout" : "grid"];
  if (block.graphExercise) flags.push("graph");
  if (block.equalColumns) flags.push("equal");
  if (block.topAligned) flags.push("top");
  const lines = [
    `:::table ${flags.join(" ")} widths=${block.columnWidths.join(",")}`,
  ];
  for (const row of block.rows) {
    lines.push(":::row");
    for (const cell of row.cells) {
      const span = cell.colSpan && cell.colSpan > 1 ? ` span=${cell.colSpan}` : "";
      lines.push(`:::cell${span}`);
      const body = serializeBlocks(cell.blocks);
      if (body.length > 0) lines.push(body.join("\n\n"));
      lines.push(":::endcell");
    }
    lines.push(":::endrow");
  }
  lines.push(":::endtable");
  return [lines.join("\n")];
}

function serializeBlock(block: MaterialContentBlock): string[] {
  if (block.type === "paragraph") {
    const line = paragraphLine(block);
    return line ? [line] : [];
  }
  if (block.type === "image") return [imageLine(block.alt, block.src)];
  if (block.type === "bankTask") return [`:::task ${block.bank}:${block.id}`];
  return serializeTable(block);
}

function serializeBlocks(blocks: MaterialContentBlock[]): string[] {
  return blocks.flatMap(serializeBlock).filter((chunk) => chunk.trim());
}

export function blocksToTextbookMarkup(blocks: MaterialContentBlock[]): string {
  return serializeBlocks(blocks).join("\n\n").trim();
}

export function safeImageSrc(src: string): string | null {
  const trimmed = src.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  if (trimmed.includes("..") || trimmed.includes("\\") || /\s/.test(trimmed)) return null;
  if (!/^\/[A-Za-z0-9/_\-.]+$/.test(trimmed)) return null;
  return trimmed;
}

function paragraphBlock(
  line: string,
  variant: MaterialParagraphBlock["variant"],
  align: Align | null,
): MaterialParagraphBlock {
  const runs = parseInline(line);
  const onlyDisplay =
    runs.length === 1 && runs[0]?.math === true && runs[0].text.startsWith("\\[");
  const inferred: Align =
    onlyDisplay ? "center" : variant === "listItem" || variant === "body" ? "both" : "left";
  return { type: "paragraph", variant, align: align ?? inferred, runs };
}

function splitAlign(line: string): { align: Align | null; rest: string } {
  if (!line.startsWith("@")) return { align: null, rest: line };
  const match = /^(left|center|right|both) ([\s\S]*)$/.exec(line.slice(1));
  if (!match) return { align: null, rest: line };
  return { align: match[1] as Align, rest: match[2] };
}

function splitTableRow(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  for (let index = 0; index < line.length; index += 1) {
    if (line[index] === "\\" && line[index + 1] === "|") {
      current += "|";
      index += 1;
      continue;
    }
    if (line[index] === "|") {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += line[index];
  }
  cells.push(current.trim());
  if (cells[0] === "") cells.shift();
  if (cells[cells.length - 1] === "") cells.pop();
  return cells;
}

function isSeparatorRow(cells: string[]): boolean {
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function cellBlocks(text: string): MaterialContentBlock[] {
  const image = text.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
  if (image) {
    const src = safeImageSrc(image[2] ?? "");
    if (!src) return [];
    return [{ type: "image", src, alt: image[1] ?? "" }];
  }
  if (!text) return [];
  return [
    {
      type: "paragraph",
      variant: "body",
      align: "center",
      runs: parseInline(text),
    },
  ];
}

function tableBlock(lines: string[]): MaterialTableBlock | null {
  const rows = lines
    .map(splitTableRow)
    .filter((cells) => !isSeparatorRow(cells));
  if (rows.length === 0) return null;
  const width = Math.max(...rows.map((cells) => cells.length));
  return {
    type: "table",
    variant: "grid",
    equalColumns: true,
    columnWidths: Array.from({ length: width }, () => 1000),
    rows: rows.map((cells) => ({
      cells: Array.from({ length: width }, (_, index) => ({
        blocks: cellBlocks(cells[index] ?? ""),
      })),
    })),
  };
}

function graphPaperBlock(): MaterialTableBlock {
  return {
    type: "table",
    variant: "graphPaper",
    equalColumns: true,
    columnWidths: Array.from({ length: GRAPH_COLUMNS }, () => 284),
    rows: Array.from({ length: GRAPH_ROWS }, () => ({
      cells: Array.from({ length: GRAPH_COLUMNS }, () => ({ blocks: [] })),
    })),
  };
}

function graphExercise(lines: string[]): MaterialContentBlock {
  return {
    type: "table",
    variant: "grid",
    graphExercise: true,
    columnWidths: [9000],
    rows: [
      {
        cells: [
          {
            blocks: [...parseLines(lines), graphPaperBlock()],
          },
        ],
      },
    ],
  };
}

function unescapeLine(line: string): string | null {
  if (
    line.startsWith("\\#") ||
    line.startsWith("\\- ") ||
    line.startsWith("\\|") ||
    line.startsWith("\\:::") ||
    line.startsWith("\\![") ||
    /^\\@(?:left|center|right|both) /.test(line)
  ) {
    return line.slice(1);
  }
  return null;
}

type Fence = { inner: string[]; next: number };

function isOpener(line: string, kind: "table" | "row" | "cell"): boolean {
  if (kind === "row") return line === ":::row";
  return line === `:::${kind}` || line.startsWith(`:::${kind} `);
}

function readUntilEnd(
  lines: string[],
  index: number,
  kind: "table" | "row" | "cell",
): Fence {
  const end = `:::end${kind}`;
  const inner: string[] = [];
  let depth = 1;
  while (index < lines.length) {
    const trimmed = (lines[index] ?? "").trim();
    if (trimmed === end) {
      depth -= 1;
      if (depth === 0) return { inner, next: index + 1 };
    } else if (isOpener(trimmed, kind)) {
      depth += 1;
    }
    inner.push(lines[index] ?? "");
    index += 1;
  }
  return { inner, next: index };
}

function parsePaper(line: string): MaterialTableBlock | null {
  const match = /^:::paper (\d+) (\d+)(?: (\d+))?$/.exec(line.trim());
  if (!match) return null;
  const rows = Math.min(Math.max(Number(match[1]), 1), 40);
  const cols = Math.min(Math.max(Number(match[2]), 1), 40);
  const width = Math.max(Number(match[3] ?? 284), 1);
  return {
    type: "table",
    variant: "graphPaper",
    columnWidths: Array.from({ length: cols }, () => width),
    rows: Array.from({ length: rows }, () => ({
      cells: Array.from({ length: cols }, () => ({ blocks: [] })),
    })),
  };
}

function parseStructuredTable(header: string, inner: string[]): MaterialTableBlock {
  const widthsMatch = /\swidths=([0-9,]+)\s*$/.exec(header);
  const widths = widthsMatch
    ? widthsMatch[1].split(",").filter(Boolean).map((value) => Number(value))
    : [];
  const flagText = header
    .replace(/^:::table\s*/, "")
    .replace(/\swidths=[0-9,]+\s*$/, "")
    .trim();
  const flags = new Set(flagText.split(/\s+/).filter(Boolean));
  const rows = parseStructuredRows(inner);
  const columnCount = Math.max(
    widths.length,
    ...rows.map((row) =>
      row.reduce((sum, cell) => sum + (cell.colSpan ?? 1), 0),
    ),
    1,
  );
  const table: MaterialTableBlock = {
    type: "table",
    variant: flags.has("layout") ? "layout" : "grid",
    columnWidths:
      widths.length > 0
        ? widths
        : Array.from({ length: columnCount }, () => 1000),
    rows: rows.map((row) => ({ cells: row })),
  };
  if (flags.has("equal")) table.equalColumns = true;
  if (flags.has("graph")) table.graphExercise = true;
  if (flags.has("top")) table.topAligned = true;
  return table;
}

function parseStructuredRows(lines: string[]): MaterialTableBlock["rows"][number]["cells"][] {
  const rows: MaterialTableBlock["rows"][number]["cells"][] = [];
  let index = 0;
  while (index < lines.length) {
    if (lines[index]?.trim() !== ":::row") {
      index += 1;
      continue;
    }
    const fence = readUntilEnd(lines, index + 1, "row");
    rows.push(parseStructuredCells(fence.inner));
    index = fence.next;
  }
  return rows;
}

function parseStructuredCells(
  lines: string[],
): MaterialTableBlock["rows"][number]["cells"] {
  const cells: MaterialTableBlock["rows"][number]["cells"] = [];
  let index = 0;
  while (index < lines.length) {
    const header = lines[index]?.trim() ?? "";
    const span = /^:::cell(?: span=(\d+))?$/.exec(header);
    if (!span) {
      index += 1;
      continue;
    }
    const fence = readUntilEnd(lines, index + 1, "cell");
    const colSpan = Number(span[1] ?? 1);
    const cell: MaterialTableBlock["rows"][number]["cells"][number] = {
      blocks: parseLines(fence.inner),
    };
    if (colSpan > 1) cell.colSpan = colSpan;
    cells.push(cell);
    index = fence.next;
  }
  return cells;
}

function parseLines(lines: string[]): MaterialContentBlock[] {
  const blocks: MaterialContentBlock[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (!line.trim()) {
      index += 1;
      continue;
    }
    if (line.trim().startsWith(":::task")) {
      const task = parseBankTaskLine(line);
      if (task) blocks.push({ type: "bankTask", bank: task.bank, id: task.id });
      index += 1;
      continue;
    }
    if (line.trim() === ":::graph") {
      const inner: string[] = [];
      index += 1;
      while (index < lines.length && (lines[index] ?? "").trim() !== ":::") {
        inner.push(lines[index] ?? "");
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push(graphExercise(inner));
      continue;
    }
    if (line.startsWith("|")) {
      const tableLines = [line];
      index += 1;
      while (index < lines.length && (lines[index] ?? "").startsWith("|")) {
        tableLines.push(lines[index] ?? "");
        index += 1;
      }
      const table = tableBlock(tableLines);
      if (table) blocks.push(table);
      continue;
    }
    const image = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (image) {
      const src = safeImageSrc(image[2] ?? "");
      if (src) blocks.push({ type: "image", src, alt: image[1] ?? "" });
      index += 1;
      continue;
    }
    if (line.trim().startsWith(":::paper ")) {
      const paper = parsePaper(line);
      if (paper) blocks.push(paper);
      index += 1;
      continue;
    }
    if (line.trim() === ":::table" || line.trim().startsWith(":::table ")) {
      const fence = readUntilEnd(lines, index + 1, "table");
      blocks.push(parseStructuredTable(line.trim(), fence.inner));
      index = fence.next;
      continue;
    }
    const aligned = splitAlign(line);
    const plain = unescapeLine(aligned.rest);
    const text = plain ?? aligned.rest;
    if (plain !== null && aligned.align === null) {
      blocks.push(paragraphBlock(plain, "body", null));
      index += 1;
      continue;
    }
    if (text.startsWith("## ")) {
      blocks.push(paragraphBlock(text.slice(3), "subheading", aligned.align));
      index += 1;
      continue;
    }
    if (text.startsWith("# ")) {
      blocks.push(paragraphBlock(text.slice(2), "sectionHeading", aligned.align));
      index += 1;
      continue;
    }
    if (text.startsWith("- ")) {
      blocks.push(paragraphBlock(text.slice(2), "listItem", aligned.align));
      index += 1;
      continue;
    }
    blocks.push(paragraphBlock(text, "body", aligned.align));
    index += 1;
  }
  return blocks;
}

export function parseTextbookMarkup(source: string): MaterialContentBlock[] {
  return parseLines(source.replace(/\r\n/g, "\n").split("\n"));
}
