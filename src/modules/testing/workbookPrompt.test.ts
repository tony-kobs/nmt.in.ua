import assert from "node:assert/strict";
import test from "node:test";

import { normalizeWorkbookPrompt } from "./workbookPrompt";

test("arithmetic workbook lines get spaces and a minus sign", () => {
  assert.equal(normalizeWorkbookPrompt("16+2=?"), "16 + 2 = ?");
  assert.equal(normalizeWorkbookPrompt("25 - 9 = ?"), "25 − 9 = ?");
  assert.equal(normalizeWorkbookPrompt("7 × 6 = ?"), "7 × 6 = ?");
  assert.equal(normalizeWorkbookPrompt("2*3=?"), "2 × 3 = ?");
});

test("prose and units are left as stored", () => {
  const prose = "Площа прямокутника 12 см × 3 см...";
  assert.equal(normalizeWorkbookPrompt(prose), prose);
  assert.equal(normalizeWorkbookPrompt("Об'єм прямокутного паралелепіпеда 2×3×4..."), "Об'єм прямокутного паралелепіпеда 2×3×4...");
});
