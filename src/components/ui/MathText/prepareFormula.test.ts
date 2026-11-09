import assert from "node:assert/strict";
import test from "node:test";
import katex from "katex";

import { prepareFormulaForKatex, revealTextCommands } from "./prepareFormula";

function visible(formula: string): string {
  const html = katex.renderToString(prepareFormulaForKatex(formula), {
    throwOnError: true,
    output: "html",
    strict: "ignore",
  });
  assert.doesNotMatch(html, /katex-error/);
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

test("a percent inside \\text renders as %", () => {
  assert.equal(prepareFormulaForKatex(String.raw`25\text{%}`), String.raw`25\text{\%}`);
  assert.match(visible(String.raw`25\text{%}`), /25%/);
  assert.match(visible(String.raw`x = 25\text{%}`), /25%/);
  assert.doesNotMatch(visible(String.raw`x = 25\text{%}`), /text/);
  assert.match(visible(String.raw`25\text{\%}`), /25%/);
});

test("similar symbols inside \\text stay visible", () => {
  assert.equal(visible(String.raw`10\text{#}`), "10#");
  assert.equal(visible(String.raw`\text{&}`), "&");
  assert.equal(visible(String.raw`\text{$}`), "$");
  assert.equal(visible(String.raw`\text{a_b}`), "a_b");
  assert.equal(visible(String.raw`\text{см}`), "см");
});

test("alignment and math subscripts stay commands", () => {
  const cases = String.raw`\begin{cases} x &= 1 \\ y &= 2 \end{cases}`;
  assert.equal(prepareFormulaForKatex(cases), cases);
  assert.equal(prepareFormulaForKatex(String.raw`\mathrm{H_2}`), String.raw`\mathrm{H_2}`);
  assert.doesNotMatch(visible(String.raw`\mathrm{H_2}`), /katex-error/);
});

test("a bare text command in a sentence becomes the symbol", () => {
  assert.equal(revealTextCommands(String.raw`частка 25\text{%}`), "частка 25%");
  assert.equal(revealTextCommands(String.raw`10\text{#}`), "10#");
  assert.equal(revealTextCommands(String.raw`10\text{\%}`), "10%");
});
