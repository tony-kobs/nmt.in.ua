import assert from "node:assert/strict";
import test from "node:test";

import { selectCardHint } from "./cardHint";

test("the card hint is only the short field", () => {
  assert.equal(
    selectCardHint({ short: " Подивіться на знак. " }),
    "Подивіться на знак.",
  );
  assert.equal(selectCardHint({ short: "" }), null);
  assert.equal(selectCardHint({ short: "   " }), null);
  assert.equal(selectCardHint({}), null);
});

test("a worked solution is not a short hint", () => {
  assert.equal(selectCardHint({ short: "Правильна відповідь: 20" }), null);
  assert.equal(selectCardHint({ short: "Відповідь: 8" }), null);
  assert.equal(
    selectCardHint({ short: "Маємо −10 ≤ 2x ≤ 15, тому −7 ≤ x < 9. Найбільше ціле значення — 8." }),
    null,
  );
  assert.equal(selectCardHint({ short: "а".repeat(281) }), null);
});
