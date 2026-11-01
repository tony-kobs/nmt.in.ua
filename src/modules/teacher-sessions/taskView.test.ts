import assert from "node:assert/strict";
import test from "node:test";

import { chooseMigratedTaskIds } from "./migratePlan";
import { buildSessionTitle, mapQuizTaskRow, parseTaskIdList } from "./taskView";
import { MAX_SESSION_TASKS } from "./types";

test("chooseMigratedTaskIds keeps the earliest started attempt in mapping order", () => {
  const ids = chooseMigratedTaskIds([
    { taskSessionId: 8, firstMappingId: 40, taskIds: [3, 1] },
    { taskSessionId: 2, firstMappingId: 10, taskIds: [9, 9, 4, 0] },
  ]);
  assert.deepEqual(ids, [9, 4]);
});

test("chooseMigratedTaskIds returns null when nobody started", () => {
  assert.equal(
    chooseMigratedTaskIds([
      { taskSessionId: 1, firstMappingId: 0, taskIds: [] },
      { taskSessionId: 2, firstMappingId: 5, taskIds: [] },
    ]),
    null,
  );
});

test("mapQuizTaskRow keeps the bank letter when an empty option is hidden", () => {
  const view = mapQuizTaskRow({
    id: 7,
    name: "  Назва  ",
    task_text: "  2+2  ",
    difficulty: "2",
    answer_1: "3",
    answer_2: "   ",
    answer_3: "4",
    answer_4: "5",
    right_answer_n: "3",
    comments: "  бо 4  ",
    position: 2,
  });
  assert.equal(view.missing, false);
  assert.deepEqual(
    view.options.map((option) => option.number),
    [1, 3, 4],
  );
  assert.equal(view.correctNumber, 3);
  assert.equal(view.explanation, "бо 4");
  assert.equal(view.position, 2);
});

test("mapQuizTaskRow marks a missing bank row", () => {
  const view = mapQuizTaskRow({ id: null, position: 4 });
  assert.equal(view.missing, true);
  assert.equal(view.position, 4);
});

test("parseTaskIdList drops duplicates and rejects a list past the cap", () => {
  assert.deepEqual(parseTaskIdList(["2", 2, "4"], MAX_SESSION_TASKS), [2, 4]);
  assert.equal(parseTaskIdList(["x"], MAX_SESSION_TASKS), null);
  assert.equal(
    parseTaskIdList(
      Array.from({ length: MAX_SESSION_TASKS + 1 }, (_, index) => index + 1),
      MAX_SESSION_TASKS,
    ),
    null,
  );
});

test("buildSessionTitle trims the theme and stays within 160 characters", () => {
  assert.equal(buildSessionTitle("  Дроби ", 2), "Дроби · рівень 2");
  const long = buildSessionTitle("А".repeat(200), 1);
  assert.equal(long.length, 160);
});
