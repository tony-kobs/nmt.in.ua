import assert from "node:assert/strict";
import test from "node:test";
import { checkTextbookImage, TEXTBOOK_IMAGE_MAX_BYTES, textbookImagePath } from "./imageLimits";
import { lintTextbookMarkup } from "./lint";
import { applyTextbookSnippet } from "./templates";

const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const webp = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
]);
const gif = Uint8Array.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]);
const svg = Uint8Array.from(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>"));

test("textbook images accept png, jpeg, webp and gif and reject svg, empty and oversized bytes", () => {
  for (const bytes of [png, jpeg, webp, gif]) {
    const checked = checkTextbookImage(bytes);
    assert.equal(checked.ok, true);
  }
  const svgCheck = checkTextbookImage(svg);
  assert.equal(svgCheck.ok, false);
  if (!svgCheck.ok) assert.equal(svgCheck.code, "type");
  const empty = checkTextbookImage(new Uint8Array());
  assert.equal(empty.ok, false);
  if (!empty.ok) assert.equal(empty.code, "size");
  const huge = new Uint8Array(TEXTBOOK_IMAGE_MAX_BYTES + 1);
  huge.set(png);
  const sized = checkTextbookImage(huge);
  assert.equal(sized.ok, false);
  if (!sized.ok) assert.equal(sized.code, "size");
  assert.equal(textbookImagePath("ab".repeat(32)), "/api/textbook-media/" + "ab".repeat(32));
  assert.equal(textbookImagePath("ab".repeat(16)), null);
});

test("toolbar templates have no markup errors and a broken formula is reported", () => {
  for (const id of ["heading", "subheading", "list", "formula", "table", "grid", "graph", "image", "task", "note"] as const) {
    const edit = applyTextbookSnippet("", 0, 0, id);
    assert.deepEqual(lintTextbookMarkup(edit.value), [], id);
  }
  const broken = lintTextbookMarkup("\\[\\frac{\\]");
  assert.equal(broken.some((issue) => issue.code === "formula" || issue.code === "math"), true);
  const open = lintTextbookMarkup(":::table grid widths=1000\n:::row\n:::cell\nТекст");
  assert.deepEqual(
    open.map((issue) => issue.detail),
    [":::cell", ":::row", ":::table"],
  );
  const pending = lintTextbookMarkup("![Завантаження…](pending-ab12)");
  assert.deepEqual(pending, []);
  const badSrc = lintTextbookMarkup("![схема](https://example.com/a.png)");
  assert.equal(badSrc[0]?.code, "image");
  const paper = lintTextbookMarkup(":::paper wide");
  assert.equal(paper[0]?.code, "paper");
});
