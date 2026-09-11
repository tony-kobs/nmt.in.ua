import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

/**
 * `resolveAnswerCardState` (see `answerCardState.ts`) already proves the
 * *domain* rule: diagnostic mode resolves a picked answer to "selected", never
 * "correct"/"incorrect". That is not enough on its own — the regression this
 * guards against was CSS-only: `.answerSelected` was styled with the exact
 * same green as `.answerCorrect`, so the "neutral" state still *looked*
 * correct. There is no component-render test harness in this repo (test glob
 * is plain `node:test` over `.ts`, no DOM), so this asserts the invariant
 * directly against the compiled CSS module text instead.
 */
const css = readFileSync(
  path.join(__dirname, "TopicTrainer.module.css"),
  "utf8",
);

function ruleBody(className: string): string {
  const match = css.match(
    new RegExp(`\\.${className}\\s*\\{([^}]*)\\}`),
  );
  assert.ok(match, `expected a .${className} rule in TopicTrainer.module.css`);
  return match[1];
}

test(".answerSelected (diagnostic's persistent post-submit state) is neutral, not green/red", () => {
  const selected = ruleBody("answerSelected");
  assert.doesNotMatch(
    selected,
    /--green|crimson/,
    ".answerSelected must not reuse the correct/incorrect colors — diagnostic mode never leaves this state, so any correctness color leaks for the rest of the session",
  );
});

test(".answerCorrect and .answerWrong keep their correctness colors for Practice/exam feedback", () => {
  assert.match(ruleBody("answerCorrect"), /--green/);
  assert.match(ruleBody("answerWrong"), /crimson/);
});

test(".answerSelected stays visually distinct from both graded states", () => {
  const selected = ruleBody("answerSelected");
  const correct = ruleBody("answerCorrect");
  const wrong = ruleBody("answerWrong");
  assert.notEqual(selected.trim(), correct.trim());
  assert.notEqual(selected.trim(), wrong.trim());
});
