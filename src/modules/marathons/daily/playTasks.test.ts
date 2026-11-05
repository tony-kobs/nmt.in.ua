import assert from "node:assert/strict";
import test from "node:test";

import {
  dayClientPayload,
  PENDING_TASK_SQL,
  projectPendingTask,
  projectReviewedTask,
  REVIEW_TASK_SQL,
  type TaskSourceRow,
} from "./playTasks";

const SECRET = "пояснення-секрет-якого-немає-до-здачі";

function bankRow(): TaskSourceRow {
  return {
    id: 7,
    sort_order: 1,
    question_id: 11,
    inline_prompt: null,
    inline_options: null,
    inline_correct: 9,
    inline_explanation: `inline-${SECRET}`,
    task_text: "Обчисліть значення виразу.",
    answer_1: "0",
    answer_2: "12",
    answer_3: "24",
    answer_4: "66",
    right_answer_n: 2,
    comments: SECRET,
  };
}

test("pending payload is an allowlist and omits the key and the explanation", () => {
  const pending = projectPendingTask(bankRow());
  assert.ok(pending);
  assert.deepEqual(Object.keys(pending).sort(), ["id", "options", "order", "prompt"]);
  assert.deepEqual(pending, {
    id: 7,
    order: 1,
    prompt: "Обчисліть значення виразу.",
    options: ["0", "12", "24", "66"],
  });

  const serialized = JSON.stringify(pending);
  assert.equal(serialized.includes(SECRET), false);
  assert.equal(serialized.includes("inline_correct"), false);
  assert.equal(serialized.includes("right_answer_n"), false);
  assert.equal(serialized.includes("comments"), false);
  assert.doesNotMatch(serialized, /"correct"/);
  assert.doesNotMatch(serialized, /"explanation"/);
});

test("pending SQL does not select the answer key or the explanation", () => {
  assert.doesNotMatch(PENDING_TASK_SQL, /inline_correct/);
  assert.doesNotMatch(PENDING_TASK_SQL, /right_answer_n/);
  assert.doesNotMatch(PENDING_TASK_SQL, /comments/);
  assert.doesNotMatch(PENDING_TASK_SQL, /inline_explanation/);
  assert.doesNotMatch(PENDING_TASK_SQL, /hint_/);
  assert.match(REVIEW_TASK_SQL, /right_answer_n/);
  assert.match(REVIEW_TASK_SQL, /comments/);
  assert.match(REVIEW_TASK_SQL, /inline_explanation/);
});

test("unsubmitted day client payload drops a review even if one was built", () => {
  const pending = projectPendingTask(bankRow());
  const review = projectReviewedTask(bankRow(), { 7: 3 });
  assert.ok(pending);
  assert.ok(review);
  assert.equal(review.correct, 2);
  assert.equal(review.right, false);
  assert.equal(review.choice, 3);
  assert.equal(review.explanation, SECRET);

  const hidden = dayClientPayload({
    submitted: false,
    pending: [pending],
    review: [review],
  });
  const serialized = JSON.stringify(hidden);
  assert.equal(serialized.includes(SECRET), false);
  assert.doesNotMatch(serialized, /"correct"/);
  assert.deepEqual(hidden.review, []);
  assert.equal(hidden.tasks.length, 1);

  const shown = dayClientPayload({
    submitted: true,
    pending: [pending],
    review: [review],
  });
  assert.equal(shown.tasks.length, 0);
  assert.equal(shown.review[0]?.explanation, SECRET);
  assert.equal(JSON.stringify(shown).includes(SECRET), true);
});

test("inline prompt keeps signs and drops option lines that copy the buttons", () => {
  const row: TaskSourceRow = {
    id: 8,
    sort_order: 1,
    question_id: null,
    inline_prompt: "Визначте знак: 3 < 4 & 5\n\nА. <\nБ. >\nВ. =",
    inline_options: JSON.stringify(["<", ">", "="]),
    inline_correct: 1,
    inline_explanation: "бо 3 < 4 & 5 > 1",
  };
  const pending = projectPendingTask(row);
  assert.ok(pending);
  assert.equal(pending.prompt, "Визначте знак: 3 < 4 & 5");
  assert.deepEqual(pending.options, ["<", ">", "="]);
  const review = projectReviewedTask(row, {});
  assert.equal(review?.prompt, pending.prompt);
  assert.equal(review?.explanation, "бо 3 < 4 & 5 > 1");

  const mentioned: TaskSourceRow = {
    id: 9,
    sort_order: 2,
    inline_prompt: "У тексті є згадка А. не як список варіантів.",
    inline_options: JSON.stringify(["<", ">"]),
    inline_correct: 1,
  };
  assert.equal(projectPendingTask(mentioned)?.prompt, mentioned.inline_prompt);

  const bank: TaskSourceRow = {
    id: 10,
    sort_order: 3,
    question_id: 4,
    task_text: "Скільки буде 2+2?\n\nА. 3\nБ. 4",
    answer_1: "3",
    answer_2: "4",
    answer_3: null,
    answer_4: null,
    right_answer_n: 2,
  };
  assert.equal(projectPendingTask(bank)?.prompt, "Скільки буде 2+2?");
});

test("inline review uses inline_explanation and not the bank comment", () => {
  const row: TaskSourceRow = {
    id: 4,
    sort_order: 2,
    question_id: null,
    inline_prompt: "Скільки буде 2+2?",
    inline_options: JSON.stringify(["3", "4", "5"]),
    inline_correct: 2,
    inline_explanation: "2+2=4",
    comments: SECRET,
    right_answer_n: 1,
  };
  const pending = projectPendingTask(row);
  assert.ok(pending);
  assert.equal(JSON.stringify(pending).includes(SECRET), false);
  assert.equal(JSON.stringify(pending).includes("2+2=4"), false);

  const review = projectReviewedTask(row, { 4: 2 });
  assert.ok(review);
  assert.equal(review.right, true);
  assert.equal(review.explanation, "2+2=4");
  assert.equal(review.correct, 2);
});
