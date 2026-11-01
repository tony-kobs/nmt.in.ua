import assert from "node:assert/strict";
import test from "node:test";
import { checkTextbookImage } from "./imageLimits";
import { htmlToTextbookMarkup, materializeImportImages } from "./importHtml";
import { htmlLooksRich } from "./importMarkers";
import { lintTextbookMarkup } from "./lint";
import { parseTextbookMarkup } from "./markup";

const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const pngHref = `data:image/png;base64,${Buffer.from(png).toString("base64")}`;

const html = [
  "<h1>Дроби</h1>",
  "<h3>Скорочення</h3>",
  "<p>Правило <b>скорочення</b> і <i>множення</i>.</p>",
  "<ul><li>перший</li><li>другий</li></ul>",
  "<ol><li>крок один</li><li>крок два</li></ol>",
  "<table><tr><td>a</td><td><b>b</b></td></tr><tr><td>1</td><td>2</td></tr></table>",
  `<p>Обчисліть <math><semantics><msup><mi>x</mi><mn>2</mn></msup><annotation encoding="application/x-tex">x^{2}</annotation></semantics></math>.</p>`,
  "<p>Ще <math><not-a-node></not-a-node></math> і <img src=\"https://example.com/a.png\" alt=\"схема\"></p>",
  `<p><img alt="схема" src="${pngHref}"></p>`,
].join("");

test("plain clipboard html stays a normal paste, rich html becomes textbook markup", () => {
  assert.equal(htmlLooksRich("<p>hello</p>"), false);
  assert.equal(htmlLooksRich("<style>b{font-weight:700}</style><p>hello</p>"), false);
  assert.equal(htmlLooksRich('<b style="font-weight:normal"><p>hello</p></b>'), false);
  assert.equal(htmlLooksRich("<p><b>hi</b></p>"), true);
  assert.equal(htmlLooksRich('<p><span style="font-weight:700">жирний</span></p>'), true);
});

test("html import keeps headings, lists, a table, a formula and flags what it cannot convert", async () => {
  const draft = htmlToTextbookMarkup(html);
  assert.match(draft.markup, /^# Дроби/);
  assert.match(draft.markup, /## Скорочення/);
  assert.match(draft.markup, /\*\*скорочення\*\*/);
  assert.match(draft.markup, /\*множення\*/);
  assert.match(draft.markup, /^- перший\n- другий/m);
  assert.match(draft.markup, /^- крок один\n- крок два/m);
  assert.match(draft.markup, /:::table grid/);
  assert.match(draft.markup, /:::cell\na\n:::endcell/);
  assert.match(draft.markup, /\*\*b\*\*/);
  assert.match(draft.markup, /\\\(x\^\{2\}\\\)/);
  assert.match(draft.markup, /⟦формула⟧/);
  assert.match(draft.markup, /⟦картинка⟧/);
  assert.match(draft.markup, /!\[схема\]\(pending-import\d+\)/);
  assert.equal(draft.summary.deepHeadings, true);
  assert.equal(draft.summary.numberedAsBullets, true);
  assert.equal(draft.summary.headings, 2);
  assert.equal(draft.summary.lists, 2);
  assert.equal(draft.summary.tables, 1);
  assert.equal(draft.summary.formulas >= 1, true);
  assert.equal(draft.summary.reviewFormulas >= 1, true);
  assert.equal(draft.summary.reviewImages, 1);
  assert.equal(draft.images.length, 1);
  assert.equal(checkTextbookImage(draft.images[0]!.bytes).ok, true);

  const blocks = parseTextbookMarkup(draft.markup);
  assert.equal(blocks.some((block) => block.type === "table"), true);
  assert.equal(blocks.some((block) => block.type === "paragraph" && block.variant === "listItem"), true);

  const flagged = lintTextbookMarkup(draft.markup);
  assert.equal(flagged.some((issue) => issue.code === "import"), true);

  const stored = await materializeImportImages(draft, async () => ({
    ok: true,
    src: "/api/textbook-media/" + "ab".repeat(32),
  }));
  assert.match(stored.markup, /!\[схема\]\(\/api\/textbook-media\/[a-f0-9]{64}\)/);
  assert.equal(stored.markup.includes("pending-import"), false);
});
