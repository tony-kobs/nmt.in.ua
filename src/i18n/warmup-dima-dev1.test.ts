import assert from "node:assert/strict";
import test from "node:test";

import de from "../../messages/de.json";
import en from "../../messages/en.json";
import uk from "../../messages/uk.json";

const key = "dima-dev1";

test("warmup line is present in uk, en and de", () => {
  assert.equal(uk.Warmup[key], "Перший рядок розігріву");
  assert.equal(en.Warmup[key], "First warm-up line");
  assert.equal(de.Warmup[key], "Erste Aufwärmzeile");
});
