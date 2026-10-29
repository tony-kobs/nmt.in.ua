import assert from "node:assert/strict";
import test from "node:test";
import type { MaterialContentBlock } from "@/content/learningMaterials/sourceBlocks";
import { lintTextbookMarkup } from "./lint";
import { blocksToTextbookMarkup, parseTextbookMarkup } from "./markup";
import {
  buildTopicTemplate,
  TOPIC_TEMPLATE_KINDS,
  TOPIC_TEMPLATE_SECTIONS,
  topicTemplateKindForCode,
  topicTemplateMarkup,
} from "./topicTemplates";

const LETTERS = ["А", "Б", "В", "Г", "Д"] as const;

function roundtrip(source: string): MaterialContentBlock[] {
  const once = parseTextbookMarkup(source);
  return parseTextbookMarkup(blocksToTextbookMarkup(once));
}

function headings(blocks: MaterialContentBlock[]): string[] {
  return blocks.flatMap((block) => {
    if (block.type !== "paragraph" || block.variant !== "sectionHeading") return [];
    return [block.runs.map((run) => run.text).join("")];
  });
}

function taskOptions(markup: string): Array<{ letter: string; value: number }> {
  return [...markup.matchAll(/^- ([АБВГД])\) \\\((\d+)\\\)$/gm)].map((match) => ({
    letter: match[1] ?? "",
    value: Number(match[2]),
  }));
}

test("a topic template parses, lints clean and roundtrips", () => {
  for (const kind of TOPIC_TEMPLATE_KINDS) {
    const built = buildTopicTemplate(kind);
    const once = parseTextbookMarkup(built.markup);
    assert.deepEqual(headings(once), [...TOPIC_TEMPLATE_SECTIONS], kind);
    assert.equal(lintTextbookMarkup(built.markup).length, 0, kind);
    assert.deepEqual(roundtrip(built.markup), once, kind);
    assert.equal(built.markup.slice(built.selectStart, built.selectEnd).startsWith("Замініть цей абзац"), true, kind);
    const options = taskOptions(built.markup);
    assert.deepEqual(options.map((option) => option.letter), [...LETTERS], kind);
    assert.equal(new Set(options.map((option) => option.value)).size, LETTERS.length, kind);
    assert.match(built.markup, /\*\*Відповідь\.\*\* Б$/);
    const correct = options.find((option) => option.letter === "Б");
    assert.ok(correct, kind);
    if (kind === "algebra") {
      assert.equal(7 - 4, 3);
      assert.equal(correct?.value, 7 - 4);
      assert.equal(once.some((block) => block.type === "table" && block.variant === "graphPaper"), false);
    } else {
      assert.equal(5 * 2, 10);
      assert.equal(3 * 4, 12);
      assert.equal(correct?.value, 5 * 2);
      const paper = once.find((block) => block.type === "table" && block.variant === "graphPaper");
      assert.equal(paper?.type, "table");
      if (paper?.type === "table") {
        assert.equal(paper.rows.length, 12);
        assert.equal(paper.columnWidths.length, 12);
      }
      assert.match(topicTemplateMarkup(kind), /\\\[S = a \\cdot b\\\]/);
    }
  }
});

test("geometry codes use the grid template and other codes use algebra", () => {
  assert.equal(topicTemplateKindForCode("GEO-07-ELEM-PLAN"), "geometry");
  assert.equal(topicTemplateKindForCode(" geo-07-calc "), "geometry");
  assert.equal(topicTemplateKindForCode("ALG-08-FRACTIONS"), "algebra");
  assert.equal(topicTemplateKindForCode("MATH-05-ELEM-OPS"), "algebra");
  assert.equal(topicTemplateKindForCode(""), "algebra");
});
