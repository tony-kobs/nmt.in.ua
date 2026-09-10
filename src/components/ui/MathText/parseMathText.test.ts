import assert from "node:assert/strict";
import test from "node:test";
import katex from "katex";
import { parseMathText } from "./parseMathText";

test("parseMathText keeps ordinary text unchanged", () => {
  assert.deepEqual(parseMathText("Знайдіть значення виразу"), [
    {
      type: "text",
      content: "Знайдіть значення виразу",
    },
  ]);
});

test("parseMathText separates inline and display formulas", () => {
  assert.deepEqual(
    parseMathText(
      String.raw`Якщо \(x = 2\), обчисліть:\[\frac{x^2 + 1}{3}\]`,
    ),
    [
      { type: "text", content: "Якщо " },
      { type: "formula", content: "x = 2", displayMode: false },
      { type: "text", content: ", обчисліть:" },
      {
        type: "formula",
        content: String.raw`\frac{x^2 + 1}{3}`,
        displayMode: true,
      },
    ],
  );
});

test("parseMathText reads TeX dollar delimiters from the task bank", () => {
  assert.deepEqual(
    parseMathText(String.raw`Знайдіть $15\%$ від числа $240$.`),
    [
      { type: "text", content: "Знайдіть " },
      { type: "formula", content: String.raw`15\%`, displayMode: false },
      { type: "text", content: " від числа " },
      { type: "formula", content: "240", displayMode: false },
      { type: "text", content: "." },
    ],
  );
});

test("parseMathText reads display math written with double dollars", () => {
  assert.deepEqual(parseMathText(String.raw`Формула: $$E = mc^2$$`), [
    { type: "text", content: "Формула: " },
    { type: "formula", content: "E = mc^2", displayMode: true },
  ]);
});

test("parseMathText keeps escaped and unclosed dollars as text", () => {
  assert.deepEqual(parseMathText(String.raw`Ціна \$5 і залишок $240`), [
    { type: "text", content: String.raw`Ціна \$5 і залишок $240` },
  ]);
});

function katexHtml(formula: string, displayMode = true): string {
  return katex.renderToString(formula, {
    displayMode,
    output: "html",
    throwOnError: true,
    strict: "ignore",
    trust: false,
  });
}

test("KaTeX renders formulas as HTML without duplicate MathML text", () => {
  const formulas = [
    String.raw`E = mc^2`,
    String.raw`x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}`,
    String.raw`\int_0^1 x^2\,dx`,
  ];

  for (const formula of formulas) {
    const html = katexHtml(formula);
    assert.match(html, /class="katex"/);
    assert.doesNotMatch(html, /<math/);
    assert.doesNotMatch(html, /katex-mathml/);
  }
});

test("KaTeX HTML output does not duplicate a simple numeric answer", () => {
  const html = katexHtml("20", false);
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  assert.equal(text, "20");
});

test("parseMathText + KaTeX render nested-cases content after normalize", async () => {
  const { normalizeNmtRichText } = await import(
    "@/modules/testing/normalizeNmtRichText"
  );
  const text = normalizeNmtRichText(
    String.raw`Система $$\( \begin{cases} x=1,\\ y=2. \end{cases} \)$$ кінець`,
  );
  const parts = parseMathText(text);
  const formula = parts.find((p) => p.type === "formula");
  assert.ok(formula && formula.type === "formula");
  assert.match(formula.content, /\\begin\{cases\}/);
  assert.doesNotMatch(formula.content, /\\\(/);
  const html = katex.renderToString(formula.content, {
    displayMode: true,
    output: "html",
    throwOnError: true,
    strict: "ignore",
  });
  assert.doesNotMatch(html, /katex-error/);
});
