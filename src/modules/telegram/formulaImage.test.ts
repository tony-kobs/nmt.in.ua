import assert from "node:assert/strict";
import test from "node:test";
import { renderFormulaPng } from "./formulaImage";

test("a formula becomes a png and a broken formula falls back to null", async () => {
  const png = await renderFormulaPng(String.raw`\frac{1}{2}+x^{2}`, true);
  assert.ok(png);
  assert.equal(png[0], 137);
  assert.equal(png[1], 80);
  assert.equal(png[2], 78);
  assert.equal(png[3], 71);

  const again = await renderFormulaPng(String.raw`\frac{1}{2}+x^{2}`, true);
  assert.equal(again, png);

  const failed = await renderFormulaPng("x", false, async () => {
    throw new Error("renderer down");
  });
  assert.equal(failed, null);

  const empty = await renderFormulaPng("   ");
  assert.equal(empty, null);
});
