import assert from "node:assert/strict";
import test from "node:test";

import { selectCardHint } from "./cardHint";

test("the card hint prefers the ladder nudge and skips an answer key", () => {
  assert.equal(
    selectCardHint({
      direction: " Подивись на знак. ",
      rule: "Згадай правило",
      comments: "Правильна відповідь: 20",
    }),
    "Подивись на знак.",
  );
  assert.equal(
    selectCardHint({ direction: "", rule: "Скороти дріб", comments: "Пояснення" }),
    "Скороти дріб",
  );
  assert.equal(
    selectCardHint({ comments: "Перевір знаменник." }),
    "Перевір знаменник.",
  );
  assert.equal(selectCardHint({ comments: "Правильна відповідь: 20" }), null);
  assert.equal(selectCardHint({ comments: "  " }), null);
});
