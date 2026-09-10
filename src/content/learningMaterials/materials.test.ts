import assert from "node:assert/strict";
import test from "node:test";
import katex from "katex";
import { learningMaterials } from "./materials";
import type { MaterialContentBlock } from "./sourceBlocks";

function flattenBlocks(blocks: MaterialContentBlock[]): MaterialContentBlock[] {
  return blocks.flatMap((block) =>
    block.type === "table"
      ? [
          block,
          ...block.rows.flatMap((row) =>
            row.cells.flatMap((cell) => flattenBlocks(cell.blocks)),
          ),
        ]
      : [block],
  );
}

test("learning materials contain all nine unique source documents", () => {
  assert.equal(learningMaterials.length, 9);
  assert.equal(new Set(learningMaterials.map(({ sourceFile }) => sourceFile)).size, 9);
  assert.ok(learningMaterials.every(({ blocks }) => blocks.length > 0));
});

test("source structure preserves Word tables, illustrations and body text", () => {
  const blocks = learningMaterials.flatMap(({ blocks }) => flattenBlocks(blocks));
  const circle = learningMaterials.find(
    ({ slug }) => slug === "circle-and-angles",
  );
  const circleParagraphs = flattenBlocks(circle?.blocks ?? []).filter(
    (block) => block.type === "paragraph",
  );
  const centralAngle = circleParagraphs.find((block) =>
    block.runs
      .map(({ text }) => text)
      .join("")
      .startsWith("Центральний кут кола"),
  );

  assert.equal(blocks.filter(({ type }) => type === "table").length, 50);
  const images = blocks.filter((block) => block.type === "image");

  assert.equal(images.length, 42);
  assert.equal(
    images.filter(({ src }) => src.includes("/algebra-7/")).length,
    2,
  );
  assert.ok(
    images.every(
      ({ src }) => !src.includes("/algebra-8-fractions/"),
    ),
  );
  assert.equal(centralAngle?.variant, "body");
});

test("source structure preserves Word table layout", () => {
  const graphMaterial = learningMaterials.find(
    ({ slug }) => slug === "algebra-graphs",
  );
  const fractionsMaterial = learningMaterials.find(
    ({ slug }) => slug === "algebra-8-fractions",
  );
  const graphTables = flattenBlocks(graphMaterial?.blocks ?? []).filter(
    (block) => block.type === "table",
  );
  const fractionsTables = flattenBlocks(fractionsMaterial?.blocks ?? []).filter(
    (block) => block.type === "table",
  );

  assert.deepEqual(graphTables[0]?.columnWidths, [5494, 5494]);
  assert.equal(
    graphTables.filter(({ variant }) => variant === "graphPaper").length,
    6,
  );
  assert.equal(
    graphTables.filter(
      ({ variant, equalColumns }) =>
        variant === "grid" && equalColumns,
    ).length,
    6,
  );
  assert.equal(fractionsTables[0]?.variant, "layout");
  assert.deepEqual(fractionsTables[0]?.columnWidths, [
    1800,
    1418,
    1134,
    2844,
    3792,
  ]);
  assert.deepEqual(
    fractionsTables[0]?.rows[0]?.cells.map(({ colSpan }) => colSpan ?? 1),
    [1, 2, 2],
  );
});

test("material topic links point to existing theory sections", () => {
  learningMaterials.forEach(({ blocks, topics }) => {
    const paragraphTexts = flattenBlocks(blocks)
      .filter((block) => block.type === "paragraph")
      .map((block) => block.runs.map(({ text }) => text).join("").trim());

    topics.forEach(({ match }) => {
      if (match) {
        assert.ok(paragraphTexts.some((text) => text.startsWith(match)));
      }
    });
  });
});

test("all positioned learning material formulas render as KaTeX", () => {
  const mathRuns = learningMaterials
    .flatMap(({ blocks }) => flattenBlocks(blocks))
    .flatMap((block) => (block.type === "paragraph" ? block.runs : []))
    .filter(({ math }) => math);

  assert.equal(mathRuns.length, 464);

  mathRuns.forEach(({ text }) => {
    const displayMode = text.startsWith("\\[");
    const formula = text.slice(2, -2);
    const html = katex.renderToString(formula, {
      displayMode,
      output: "html",
      throwOnError: true,
      trust: false,
    });

    assert.match(html, /class="katex"/);
    assert.doesNotMatch(html, /katex-mathml/);
  });
});
