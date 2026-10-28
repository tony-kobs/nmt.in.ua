import type {
  MaterialContentBlock,
  MaterialParagraphBlock,
  MaterialTableBlock,
  MaterialTextRun,
} from "@/content/learningMaterials/sourceBlocks";

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

function paragraphLine(block: MaterialParagraphBlock): string {
  const inline = runsToInline(block.runs);
  if (!inline.trim()) return "";
  if (block.variant === "sectionHeading") return `# ${inline}`;
  if (block.variant === "subheading") return `## ${inline}`;
  if (block.variant === "listItem") return `- ${inline}`;
  return escapeStructuralLine(inline);
}

function escapeStructuralLine(line: string): string {
  if (/^(#{1,2} |- |\||:::|!\[)/.test(line)) return `\\${line}`;
  return line;
}

function imageLine(alt: string, src: string): string {
  const safeAlt = alt.replace(/[\[\]]/g, "");
  return `![${safeAlt}](${src})`;
}

function cellMarkup(blocks: MaterialContentBlock[]): string | null {
  const parts: string[] = [];
  for (const block of blocks) {
    if (block.type === "paragraph") {
      const line = runsToInline(block.runs).replace(/\s+/g, " ").trim();
      if (line) parts.push(line);
      continue;
    }
    if (block.type === "image") {
      parts.push(imageLine(block.alt, block.src));
      continue;
    }
    return null;
  }
  return parts.join(" ").replace(/\|/g, "\\|");
}

function simpleTable(block: MaterialTableBlock): string | null {
  if (block.rows.length === 0) return null;
  const lines: string[] = [];
  for (const row of block.rows) {
    const cells: string[] = [];
    for (const cell of row.cells) {
      if (cell.colSpan && cell.colSpan > 1) return null;
      const text = cellMarkup(cell.blocks);
      if (text === null) return null;
      cells.push(text);
    }
    if (cells.length === 0) return null;
    lines.push(`| ${cells.join(" | ")} |`);
  }
  return lines.join("\n");
}

function cellHasVisibleContent(blocks: MaterialContentBlock[]): boolean {
  return blocks.some((block) => {
    if (block.type === "paragraph") return block.runs.some((run) => run.text.trim());
    if (block.type === "image") return true;
    if (block.type === "table") {
      if (block.variant === "graphPaper") return false;
      return block.rows.some((row) =>
        row.cells.some((cell) => cellHasVisibleContent(cell.blocks)),
      );
    }
    return false;
  });
}

function serializeGraphCell(blocks: MaterialContentBlock[]): string {
  const lines = [":::graph"];
  for (const block of blocks) {
    if (block.type === "table" && block.variant === "graphPaper") continue;
    for (const chunk of serializeBlock(block)) {
      lines.push(...chunk.split("\n"));
    }
  }
  lines.push(":::");
  return lines.join("\n");
}

function serializeTable(block: MaterialTableBlock): string[] {
  if (block.variant === "graphPaper") return [":::graph\n:::"];
  if (block.graphExercise) {
    const chunks: string[] = [];
    for (const row of block.rows) {
      for (const cell of row.cells) {
        if (!cellHasVisibleContent(cell.blocks)) continue;
        chunks.push(serializeGraphCell(cell.blocks));
      }
    }
    return chunks;
  }

  if (block.variant === "layout") {
    const flat: string[] = [];
    for (const row of block.rows) {
      for (const cell of row.cells) {
        flat.push(...serializeBlocks(cell.blocks));
      }
    }
    return flat;
  }

  const table = simpleTable(block);
  if (table) return [table];

  const flat: string[] = [];
  for (const row of block.rows) {
    for (const cell of row.cells) {
      flat.push(...serializeBlocks(cell.blocks));
    }
  }
  return flat;
}

function serializeBlock(block: MaterialContentBlock): string[] {
  if (block.type === "paragraph") {
    const line = paragraphLine(block);
    return line ? [line] : [];
  }
  if (block.type === "image") return [imageLine(block.alt, block.src)];
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
): MaterialParagraphBlock {
  const runs = parseInline(line);
  const onlyDisplay =
    runs.length === 1 && runs[0]?.math === true && runs[0].text.startsWith("\\[");
  const align =
    onlyDisplay ? "center" : variant === "listItem" || variant === "body" ? "both" : "left";
  return { type: "paragraph", variant, align, runs };
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
    line.startsWith("\\![")
  ) {
    return line.slice(1);
  }
  return null;
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
    const plain = unescapeLine(line);
    if (plain !== null) {
      blocks.push(paragraphBlock(plain, "body"));
      index += 1;
      continue;
    }
    if (line.startsWith("## ")) {
      blocks.push(paragraphBlock(line.slice(3), "subheading"));
      index += 1;
      continue;
    }
    if (line.startsWith("# ")) {
      blocks.push(paragraphBlock(line.slice(2), "sectionHeading"));
      index += 1;
      continue;
    }
    if (line.startsWith("- ")) {
      blocks.push(paragraphBlock(line.slice(2), "listItem"));
      index += 1;
      continue;
    }
    blocks.push(paragraphBlock(line, "body"));
    index += 1;
  }
  return blocks;
}

export function parseTextbookMarkup(source: string): MaterialContentBlock[] {
  return parseLines(source.replace(/\r\n/g, "\n").split("\n"));
}
