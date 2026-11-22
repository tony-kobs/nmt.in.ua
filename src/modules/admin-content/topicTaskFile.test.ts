import assert from "node:assert/strict";
import test from "node:test";
import {
  parseTopicTaskCsv,
  parseTopicTaskJson,
  planTopicTasks,
  topicTasksToCsv,
  topicTasksToJson,
  type StoredTopicTask,
  type TopicParamSpec,
} from "./topicTaskFile";

const params: TopicParamSpec[] = [{ code: "steps", valueType: "int" }];

const stored: StoredTopicTask = {
  id: 7,
  name: "Сума",
  taskText: "Обчисліть $x^{2}+1$.",
  answer1: "$1$",
  answer2: "$2$",
  answer3: "$3$",
  answer4: "$4$",
  rightAnswerN: 2,
  comments: "бо $x=1$",
  difficulty: 3,
  status: "published",
  hintShort: "степінь",
  params: { steps: 2 },
};

test("export then import of the same topic tasks reports no changes", () => {
  const csv = topicTasksToCsv([stored], params);
  const parsed = parseTopicTaskCsv(csv, params);
  assert.equal(parsed.errors.length, 0);
  const plan = planTopicTasks({
    rows: parsed.rows,
    parseErrors: [],
    current: [stored],
    foreignIds: new Map(),
    protectedIds: new Map(),
    deleteMissing: false,
  });
  assert.equal(plan.create.length, 0);
  assert.equal(plan.update.length, 0);
  assert.equal(plan.unchanged, 1);
  assert.equal(plan.errors.length, 0);
  const json = parseTopicTaskJson(topicTasksToJson([stored], params), params);
  const again = planTopicTasks({
    rows: json.rows,
    parseErrors: json.errors,
    current: [stored],
    foreignIds: new Map(),
    protectedIds: new Map(),
    deleteMissing: true,
  });
  assert.equal(again.deleteIds.length, 0);
  assert.equal(again.unchanged, 1);
});

test("import creates a blank id, updates this topic, and rejects a foreign id", () => {
  const csv = [
    "id;name;task_text;answer_1;answer_2;answer_3;answer_4;right_answer_n;comments;difficulty;status;hint_short",
    ";Нове;Скільки буде 2+2?;3;4;5;6;2;;1;published;",
    "7;Сума;Обчисліть $x^{2}+1$.;$1$;$2$;$3$;$4$;2;бо $x=1$;4;draft;степінь",
    "99;Чуже;Текст;а;б;в;г;1;;1;published;",
  ].join("\n");
  const parsed = parseTopicTaskCsv(csv, []);
  const plan = planTopicTasks({
    rows: parsed.rows,
    parseErrors: parsed.errors,
    current: [stored, { ...stored, id: 8, name: "Інше", taskText: "Інше питання з відповіддю." }],
    foreignIds: new Map([[99, 4]]),
    protectedIds: new Map([[8, "Є в дні марафону."]]),
    deleteMissing: true,
  });
  assert.equal(plan.create.length, 1);
  assert.equal(plan.update.length, 1);
  assert.equal(plan.update[0]?.fields.difficulty, 4);
  assert.equal(plan.update[0]?.fields.taskText, "Обчисліть $x^{2}+1$.");
  assert.equal(plan.deleteIds.length, 0);
  assert.deepEqual(plan.skipped, [{ id: 8, reason: "Є в дні марафону." }]);
  assert.match(plan.errors.map((item) => item.message).join(" "), /іншій темі/);
});

test("a comma-separated task file is rejected", () => {
  const parsed = parseTopicTaskCsv("id,task_text\n1,текст", []);
  assert.match(parsed.errors[0]?.message ?? "", /Роздільник має бути ;/);
});
