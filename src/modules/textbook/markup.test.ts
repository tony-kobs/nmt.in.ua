import assert from "node:assert/strict";
import test from "node:test";
import { getTextbookBlocks, textbookThemeCodes } from "@/content/learningMaterials/textbook";
import type { MaterialContentBlock } from "@/content/learningMaterials/sourceBlocks";
import { blocksToTextbookMarkup, parseTextbookMarkup } from "./markup";

function walk(blocks: MaterialContentBlock[], visit: (block: MaterialContentBlock) => void) {
  for (const block of blocks) {
    visit(block);
    if (block.type === "table") {
      for (const row of block.rows) {
        for (const cell of row.cells) walk(cell.blocks, visit);
      }
    }
  }
}

function paragraphTexts(blocks: MaterialContentBlock[]): string[] {
  const texts: string[] = [];
  walk(blocks, (block) => {
    if (block.type !== "paragraph") return;
    const text = block.runs
      .map((run) => run.text)
      .join("")
      .replace(/\u00a0/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (text) texts.push(text);
  });
  return texts;
}

function imageSources(blocks: MaterialContentBlock[]): string[] {
  const sources: string[] = [];
  walk(blocks, (block) => {
    if (block.type === "image") sources.push(block.src);
  });
  return sources;
}

function layoutShapes(blocks: MaterialContentBlock[]): string[] {
  const shapes: string[] = [];
  walk(blocks, (block) => {
    if (block.type !== "table" || block.variant !== "layout") return;
    shapes.push(block.rows.map((row) => row.cells.map((cell) => cell.colSpan ?? 1).join("+")).join("/"));
  });
  return shapes;
}

function colSpans(blocks: MaterialContentBlock[]): number[] {
  const spans: number[] = [];
  walk(blocks, (block) => {
    if (block.type !== "table") return;
    for (const row of block.rows) {
      for (const cell of row.cells) {
        if ((cell.colSpan ?? 1) > 1) spans.push(cell.colSpan ?? 1);
      }
    }
  });
  return spans;
}

function gridSizes(blocks: MaterialContentBlock[]): string[] {
  const sizes: string[] = [];
  walk(blocks, (block) => {
    if (block.type !== "table") return;
    if (block.variant === "graphPaper" || block.graphExercise) {
      const cols = block.graphExercise
        ? (block.rows[0]?.cells.length ?? 0)
        : block.columnWidths.length;
      sizes.push(`${block.variant}:${block.rows.length}x${cols}`);
    }
  });
  return sizes;
}

test("textbook markup roundtrip keeps text, images, layout, colspan and grid size", () => {
  for (const code of textbookThemeCodes()) {
    const original = getTextbookBlocks(code);
    const round = parseTextbookMarkup(blocksToTextbookMarkup(original));
    assert.deepEqual(paragraphTexts(round), paragraphTexts(original), `${code} text`);
    assert.deepEqual(imageSources(round), imageSources(original), `${code} images`);
    assert.deepEqual(layoutShapes(round), layoutShapes(original), `${code} layout`);
    assert.deepEqual(colSpans(round), colSpans(original), `${code} colspan`);
    assert.deepEqual(gridSizes(round), gridSizes(original), `${code} grid`);
  }
});

test("a hand-written graph fence still renders a square grid", () => {
  const blocks = parseTextbookMarkup(":::graph\n\\[y = x\\]\n:::");
  const paper = blocks
    .flatMap((block) => (block.type === "table" ? [block] : []))
    .flatMap((block) =>
      block.rows.flatMap((row) =>
        row.cells.flatMap((cell) =>
          cell.blocks.filter(
            (inner): inner is Extract<MaterialContentBlock, { type: "table" }> =>
              inner.type === "table" && inner.variant === "graphPaper",
          ),
        ),
      ),
    );
  assert.equal(paper.length, 1);
  assert.equal(paper[0]?.rows.length, 12);
  assert.equal(paper[0]?.columnWidths.length, 12);
});
