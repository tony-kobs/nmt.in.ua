import assert from "node:assert/strict";
import test from "node:test";

import { gradedOptionState, optionLetter, topicOptionsStackUntilTablet } from "./taskCard";

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

test("graded option states win over the picked outline", () => {
  assert.equal(gradedOptionState({ selected: true }), "selected");
  assert.equal(gradedOptionState({ selected: true, correct: true }), "correct");
  assert.equal(gradedOptionState({ selected: true, wrong: true }), "wrong");
  assert.equal(gradedOptionState({ selected: true, key: true }), "key");
  assert.equal(gradedOptionState({}), "idle");
  assert.equal(optionLetter(0), "А");
  assert.equal(optionLetter(4), "Д");
});
