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
  path.join(__dirname, "../TestTaskCard/TestTaskCard.module.css"),
  "utf8",
);

function ruleBody(className: string): string {
  const match = css.match(
    new RegExp(`\\.${className}\\s*\\{([^}]*)\\}`),
  );
  assert.ok(match, `expected a .${className} rule in TestTaskCard.module.css`);
  return match[1];
}

test(".optionSelected is a brand outline, not the filled correct state or --blue", () => {
  const selected = ruleBody("optionSelected");
  assert.match(selected, /--green-fill/);
  assert.match(selected, /--green-soft/);
  assert.doesNotMatch(selected, /--green-bg|crimson|--blue/);
});

test("graded option rules follow .optionSelected so they win the cascade", () => {
  const selectedAt = css.indexOf(".optionSelected");
  const correctAt = css.indexOf(".optionCorrect");
  const wrongAt = css.indexOf(".optionWrong");
  const keyAt = css.indexOf(".optionKey");
  assert.ok(selectedAt >= 0 && correctAt > selectedAt && wrongAt > selectedAt && keyAt > selectedAt);
});

test(".optionCorrect and .optionWrong keep their correctness colors for Practice/exam feedback", () => {
  assert.match(ruleBody("optionCorrect"), /--green/);
  assert.match(ruleBody("optionWrong"), /crimson/);
});

test(".optionSelected stays visually distinct from both graded states", () => {
  const selected = ruleBody("optionSelected");
  const correct = ruleBody("optionCorrect");
  const wrong = ruleBody("optionWrong");
  assert.notEqual(selected.trim(), correct.trim());
  assert.notEqual(selected.trim(), wrong.trim());
});
