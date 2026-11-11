import assert from "node:assert/strict";
import test from "node:test";

import {
  countMatchingTasks,
  matchingTaskIds,
  readStoredRule,
  rulesFromDraft,
  taskMatchesLevel,
  type ThemeLevelRule,
} from "./themeLevelMatch";

const ordinary: ThemeLevelRule = {
  paramId: 1,
  valueType: "bool",
  boolValue: 1,
  intMin: null,
  intMax: null,
};

const noModule: ThemeLevelRule = {
  paramId: 2,
  valueType: "bool",
  boolValue: 0,
  intMin: null,
  intMax: null,
};

const steps: ThemeLevelRule = {
  paramId: 3,
  valueType: "int",
  boolValue: null,
  intMin: 2,
  intMax: 3,
};

const level = [ordinary, noModule, steps];

test("a task matches when every bool and int rule holds", () => {
  const values = new Map<number, number>([
    [1, 1],
    [2, 0],
    [3, 2],
  ]);
  assert.equal(taskMatchesLevel(values, level), true);
  assert.equal(
    taskMatchesLevel(new Map([...values, [3, 3]]), level),
    true,
  );
});

test("a task with no value for a rule's parameter does not match", () => {
  assert.equal(
    taskMatchesLevel(
      new Map([
        [1, 1],
        [2, 0],
      ]),
      level,
    ),
    false,
  );
  assert.equal(taskMatchesLevel(undefined, level), false);
  assert.equal(taskMatchesLevel(new Map(), [ordinary]), false);
});

test("a bool or an int outside the rule does not match", () => {
  assert.equal(
    taskMatchesLevel(
      new Map([
        [1, 0],
        [2, 0],
        [3, 2],
      ]),
      level,
    ),
    false,
  );
  assert.equal(
    taskMatchesLevel(
      new Map([
        [1, 1],
        [2, 1],
        [3, 2],
      ]),
      level,
    ),
    false,
  );
  assert.equal(
    taskMatchesLevel(
      new Map([
        [1, 1],
        [2, 0],
        [3, 1],
      ]),
      level,
    ),
    false,
  );
  assert.equal(
    taskMatchesLevel(
      new Map([
        [1, 1],
        [2, 0],
        [3, 4],
      ]),
      level,
    ),
    false,
  );
});

test("bounds are inclusive and a level with no rules matches every task", () => {
  assert.equal(
    taskMatchesLevel(new Map([[3, 2]]), [steps]),
    true,
  );
  assert.equal(
    taskMatchesLevel(new Map([[3, 3]]), [steps]),
    true,
  );
  assert.equal(taskMatchesLevel(undefined, []), true);
});

test("countMatchingTasks skips tasks that lack a required value", () => {
  const taskIds = [10, 11, 12];
  const marks = [
    { taskId: 10, paramId: 1, intValue: 1 },
    { taskId: 10, paramId: 2, intValue: 0 },
    { taskId: 10, paramId: 3, intValue: 2 },
    { taskId: 11, paramId: 1, intValue: 1 },
    { taskId: 11, paramId: 2, intValue: 0 },
    { taskId: 12, paramId: 1, intValue: 1 },
    { taskId: 12, paramId: 2, intValue: 0 },
    { taskId: 12, paramId: 3, intValue: 9 },
  ];
  assert.equal(countMatchingTasks(taskIds, marks, level), 1);
  assert.deepEqual(matchingTaskIds(taskIds, marks, level), [10]);
  assert.equal(countMatchingTasks(taskIds, marks, []), 3);
});

test("readStoredRule keeps a bool and an inclusive int range", () => {
  assert.deepEqual(
    readStoredRule({
      param_id: "2",
      value_type: "bool",
      bool_value: 0,
      int_min: null,
      int_max: null,
    }),
    noModule,
  );
  assert.equal(
    readStoredRule({
      param_id: 3,
      value_type: "int",
      bool_value: null,
      int_min: 4,
      int_max: 1,
    }),
    null,
  );
});

test("rulesFromDraft waits until an int range is complete", () => {
  const params = [
    { id: 1, valueType: "bool" as const },
    { id: 3, valueType: "int" as const },
  ];
  const pending = rulesFromDraft(params, [
    { paramId: 1, enabled: true, boolValue: 1, intMin: "", intMax: "" },
    { paramId: 3, enabled: true, boolValue: 1, intMin: "2", intMax: "" },
  ]);
  assert.equal(pending.incomplete, true);
  assert.equal(pending.rules.length, 1);

  const ready = rulesFromDraft(params, [
    { paramId: 1, enabled: true, boolValue: 0, intMin: "", intMax: "" },
    { paramId: 3, enabled: true, boolValue: 1, intMin: "2", intMax: "3" },
  ]);
  assert.equal(ready.incomplete, false);
  assert.deepEqual(ready.rules, [
    { ...ordinary, boolValue: 0 },
    steps,
  ]);
});
