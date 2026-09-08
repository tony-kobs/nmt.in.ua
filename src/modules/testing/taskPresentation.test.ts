import assert from "node:assert/strict";
import test from "node:test";
import { resolveTaskPresentation } from "./taskPresentation";

test("plain task text with no visual markup falls back to choice with no visual", () => {
  const result = resolveTaskPresentation({ taskText: "  Розв'яжіть рівняння $x+2=5$.  " });
  assert.equal(result.format, "choice");
  assert.equal(result.visual, null);
  assert.equal(result.displayText, "Розв'яжіть рівняння $x+2=5$.");
});

test("a leading markdown image is extracted into the visual and stripped from the text", () => {
  const result = resolveTaskPresentation({
    taskText: "![Графік функції](https://example.com/graph.png)\nЩо зображено на графіку?",
  });
  assert.equal(result.format, "choice");
  assert.deepEqual(result.visual, {
    kind: "image",
    alt: "Графік функції",
    src: "https://example.com/graph.png",
  });
  assert.equal(result.displayText, "Що зображено на графіку?");
});

test("an image with empty alt is treated as decorative but still extracted", () => {
  const result = resolveTaskPresentation({
    taskText: "![](https://example.com/diagram.svg)\nОбери правильний варіант.",
  });
  assert.equal(result.visual?.kind, "image");
  assert.equal((result.visual as { alt: string }).alt, "");
});

test("an image line with nothing left afterwards is not treated as a visual", () => {
  const result = resolveTaskPresentation({
    taskText: "![Опис](https://example.com/img.png)",
  });
  assert.equal(result.visual, null);
  assert.equal(result.format, "choice");
});

test("a leading pipe table becomes table-choice with the table extracted", () => {
  const taskText = [
    "| x | f(x) |",
    "| --- | --- |",
    "| 1 | 2 |",
    "| 2 | 4 |",
    "",
    "Яка формула описує f(x)?",
  ].join("\n");

  const result = resolveTaskPresentation({ taskText });
  assert.equal(result.format, "table-choice");
  assert.deepEqual(result.visual, {
    kind: "table",
    headers: ["x", "f(x)"],
    rows: [
      ["1", "2"],
      ["2", "4"],
    ],
  });
  assert.equal(result.displayText, "Яка формула описує f(x)?");
});

test("a table with no question left below it is not classified as table-choice", () => {
  const taskText = ["| x | f(x) |", "| --- | --- |", "| 1 | 2 |"].join("\n");
  const result = resolveTaskPresentation({ taskText });
  assert.equal(result.format, "choice");
  assert.equal(result.visual, null);
});

test("text that merely mentions a pipe character is not mistaken for a table", () => {
  const result = resolveTaskPresentation({
    taskText: "Обчисліть |x - 3| для x = 1.",
  });
  assert.equal(result.format, "choice");
  assert.equal(result.visual, null);
});
