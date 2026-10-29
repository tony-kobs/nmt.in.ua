import assert from "node:assert/strict";
import test from "node:test";
import { blocksToTextbookMarkup, parseTextbookMarkup } from "./markup";
import { lintTextbookMarkup, missingTaskLint } from "./lint";
import {
  bankTaskMarkup,
  bankTaskRenderPlan,
  formatMatchAnswer,
  type BankTaskView,
} from "./bankTask";

const view = {
  ref: "quiz:4",
  bank: "quiz",
  id: 4,
  kind: "mcq",
  name: "Дроби",
  prompt: "Обчисліть.",
  image: null,
  options: [],
  match: null,
  answer: "Б",
  explanation: null,
} satisfies BankTaskView;

test("a bank task round-trips as a live reference and keeps the answer out of the markup", () => {
  const source = ["# Дроби", "", "Правило.", "", bankTaskMarkup("nmt", 17), "", "Далі."].join("\n");
  const blocks = parseTextbookMarkup(source);
  const task = blocks.find((block) => block.type === "bankTask");
  assert.equal(task?.type, "bankTask");
  if (task?.type !== "bankTask") return;
  assert.equal(task.bank, "nmt");
  assert.equal(task.id, 17);
  const round = blocksToTextbookMarkup(blocks);
  assert.match(round, /:::task nmt:17/);
  assert.equal(round.includes("Відповідь"), false);
  const again = parseTextbookMarkup(round).find((block) => block.type === "bankTask");
  assert.equal(again?.type, "bankTask");
  if (again?.type === "bankTask") {
    assert.equal(again.bank, "nmt");
    assert.equal(again.id, 17);
  }
  assert.equal(parseTextbookMarkup(":::task quiz:0").some((block) => block.type === "bankTask"), false);
  assert.equal(parseTextbookMarkup(":::task nope").some((block) => block.type === "bankTask"), false);
});

test("a missing bank task is skipped for a student and warned for an admin", () => {
  assert.equal(bankTaskRenderPlan(undefined, "student"), "skip");
  assert.equal(bankTaskRenderPlan(undefined, "admin"), "warn");
  assert.equal(bankTaskRenderPlan(view, "student"), "card");
  assert.equal(bankTaskRenderPlan(view, "admin"), "card");
});

test("lint flags a broken task reference and a deleted id, and a live id stays quiet", () => {
  const broken = lintTextbookMarkup(":::task quiz:");
  assert.equal(broken.some((issue) => issue.code === "task"), true);
  const live = "Текст\n\n:::task quiz:4\n";
  assert.equal(lintTextbookMarkup(live).some((issue) => issue.code === "task"), false);
  const missing = missingTaskLint(live, ["quiz:4"]);
  assert.equal(missing[0]?.code, "task-missing");
  assert.equal(missing[0]?.detail, "quiz:4");
  assert.equal(missingTaskLint(live, []).length, 0);
});

test("matching keys become Cyrillic pairs", () => {
  assert.equal(formatMatchAnswer("1b;2c;3a"), "1 — Б, 2 — В, 3 — А");
  assert.equal(formatMatchAnswer("1Б;2В"), "1 — Б, 2 — В");
  assert.equal(formatMatchAnswer("-35"), "-35");
  assert.equal(formatMatchAnswer("  "), null);
});
