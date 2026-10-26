import assert from "node:assert/strict";
import test from "node:test";

import { topicOptionsStackUntilTablet } from "./taskCard";

test("short topic options stay in two columns from 375", () => {
  assert.equal(
    topicOptionsStackUntilTablet(["парна", "непарна", "зростає", "спадає"]),
    false,
  );
});

test("a formula or a long option stays one column until 768", () => {
  assert.equal(
    topicOptionsStackUntilTablet(["$\\dfrac{2x+1}{x-3}$", "0", "1", "2"]),
    true,
  );
  assert.equal(
    topicOptionsStackUntilTablet([
      "графік функції симетричний відносно осі ординат і проходить через початок",
    ]),
    true,
  );
  assert.equal(topicOptionsStackUntilTablet(["![](/nmt/osvita/graph.png)"]), true);
});
