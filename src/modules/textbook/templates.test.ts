import assert from "node:assert/strict";
import test from "node:test";
import type { MaterialContentBlock } from "@/content/learningMaterials/sourceBlocks";
import { blocksToTextbookMarkup, parseTextbookMarkup } from "./markup";
import {
  applyTextbookSnippet,
  replaceMarkupToken,
  SNIPPET_IDS,
  textbookImageMarkup,
  uploadPlaceholder,
} from "./templates";

const CYRILLIC_OPTIONS = ["А", "Б", "В", "Г", "Д"] as const;

function roundtrip(source: string): MaterialContentBlock[] {
  const once = parseTextbookMarkup(source);
  return parseTextbookMarkup(blocksToTextbookMarkup(once));
}

test("every toolbar template parses and roundtrips", () => {
  for (const id of SNIPPET_IDS) {
    const edit = applyTextbookSnippet("Абзац перед блоком.", 19, 19, id);
    const once = parseTextbookMarkup(edit.value);
    assert.ok(once.length > 0, id);
    assert.ok(edit.value.slice(edit.selectionStart, edit.selectionEnd).length > 0, id);
    if (id === "graph") {
      const again = roundtrip(edit.value);
      const sheets = again.flatMap((block) => (block.type === "table" ? [block] : [])).flatMap((block) =>
        block.rows.flatMap((row) =>
          row.cells.flatMap((cell) =>
            cell.blocks.flatMap((inner) =>
              inner.type === "table" && inner.variant === "graphPaper" ? [inner] : [],
            ),
          ),
        ),
      );
      assert.equal(sheets[0]?.rows.length, 12, id);
      assert.equal(sheets[0]?.columnWidths.length, 12, id);
      assert.match(JSON.stringify(again), /y = x - 3/);
      continue;
    }
    assert.deepEqual(roundtrip(edit.value), once, id);
  }
});

test("a task template uses Cyrillic answer letters А–Д and a correct key", () => {
  const edit = applyTextbookSnippet("", 0, 0, "task");
  for (const letter of CYRILLIC_OPTIONS) {
    assert.equal(letter.charCodeAt(0) > 0x0400, true, letter);
    assert.match(edit.value, new RegExp(`^- ${letter}\\) \\\\\\(`, "m"));
  }
  assert.match(edit.value, /\*\*Відповідь\.\*\* Б$/);
  assert.equal(edit.value.includes("Б) \\(5\\)"), true);
  const blocks = parseTextbookMarkup(edit.value);
  const text = JSON.stringify(blocks);
  assert.match(text, /Задача/);
  assert.match(text, /2 \+ 3/);
});

test("an inline formula wraps a single-line selection and a display formula is inserted otherwise", () => {
  const wrapped = applyTextbookSnippet("швидкість x^2 далі", 10, 13, "formula");
  assert.equal(wrapped.value, "швидкість \\(x^2\\) далі");
  assert.equal(wrapped.value.slice(wrapped.selectionStart, wrapped.selectionEnd), "x^2");
  const parsed = parseTextbookMarkup(wrapped.value);
  assert.equal(parsed[0]?.type, "paragraph");
  if (parsed[0]?.type === "paragraph") {
    assert.equal(parsed[0].runs.some((run) => run.math && run.text.includes("x^2")), true);
  }

  const fresh = applyTextbookSnippet("", 0, 0, "formula");
  assert.match(fresh.value, /\\\[y = x\\\]/);
  assert.deepEqual(roundtrip(fresh.value), parseTextbookMarkup(fresh.value));
});

test("a grid template is a paper block and an uploaded image path roundtrips", () => {
  const grid = applyTextbookSnippet("", 0, 0, "grid");
  assert.match(grid.value, /^:::paper 12 12 284/);
  const paper = parseTextbookMarkup(grid.value).find((block) => block.type === "table");
  assert.equal(paper?.type, "table");
  if (paper?.type === "table") {
    assert.equal(paper.variant, "graphPaper");
    assert.equal(paper.rows.length, 12);
    assert.equal(paper.columnWidths.length, 12);
  }

  const src = "/api/textbook-media/" + "ab".repeat(32);
  const markup = textbookImageMarkup("Схема", src);
  const blocks = parseTextbookMarkup(markup);
  assert.deepEqual(blocks, [{ type: "image", src, alt: "Схема" }]);
  assert.equal(blocksToTextbookMarkup(blocks), markup);
});

test("an upload placeholder is replaced once and is not a stored image", () => {
  const token = "pending-ab12";
  const marker = uploadPlaceholder(token);
  const value = `Текст\n\n${marker}\n\nДалі`;
  const src = "/api/textbook-media/" + "cd".repeat(32);
  const next = replaceMarkupToken(value, token, textbookImageMarkup("Зображення", src));
  assert.equal(next.includes(marker), false);
  assert.match(next, new RegExp(`!\\[Зображення\\]\\(${src}\\)`));
  assert.equal(parseTextbookMarkup(marker).length, 0);
  assert.equal(replaceMarkupToken(value, "not a token", "x"), value);
});
