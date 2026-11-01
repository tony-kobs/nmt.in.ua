import assert from "node:assert/strict";
import test from "node:test";
import type { SqlConnection } from "@/lib/db/mysql";
import { choiceRowToView, loadBankTaskViews, nmtRowToView, searchBankTasks } from "./bankTaskStore";

test("quiz, matching, open and image rows keep letters, the key and the picture", () => {
  const quiz = choiceRowToView("quiz", {
    id: 4,
    name: "Сума",
    task_text: "Обчисліть \\(2+3\\).",
    answer_1: "\\(4\\)",
    answer_2: "\\(5\\)",
    answer_3: "\\(6\\)",
    answer_4: "\\(7\\)",
    right_answer_n: 2,
    comments: "Бо \\(2+3=5\\).",
  });
  assert.deepEqual(
    quiz.options.map((option) => option.letter),
    ["А", "Б", "В", "Г"],
  );
  assert.equal(quiz.options.find((option) => option.correct)?.letter, "Б");
  assert.equal(quiz.answer, "Б");
  assert.match(quiz.explanation ?? "", /2\+3=5/);

  const open = nmtRowToView({
    id: 8,
    name: "Модуль",
    task_text: "![графік](/nmt/osvita/plot.webp)\nОбчисліть.",
    answer_1: null,
    answer_2: null,
    answer_3: null,
    answer_4: null,
    right_answer_n: null,
    right_answer_text: "-35",
    task_kind: "open",
    comments: "Модуль.",
  });
  assert.equal(open.kind, "open");
  assert.equal(open.answer, "-35");
  assert.equal(open.image?.src, "/nmt/osvita/plot.webp");
  assert.equal(open.prompt.includes("графік"), false);
  assert.equal(open.options.length, 0);

  const match = nmtRowToView({
    id: 17,
    name: "Пари",
    task_text:
      'Установіть відповідність. [[nmt-match]]{"leftTitle":"Вираз","rightTitle":"Значення","left":["2+2","3+3","4+4"],"right":["4","6","8","5","7"]}[[/nmt-match]]',
    answer_1: "4",
    answer_2: "6",
    answer_3: "8",
    answer_4: "5",
    answer_5: "7",
    right_answer_n: null,
    right_answer_text: "1a;2b;3c",
    task_kind: "match",
    comments: "",
  });
  assert.equal(match.kind, "match");
  assert.deepEqual(match.match?.left, ["2+2", "3+3", "4+4"]);
  assert.equal(match.match?.right[0]?.label, "А");
  assert.equal(match.answer, "1 — А, 2 — Б, 3 — В");
  assert.equal(match.explanation, null);
});

function connection(state: {
  rows: Record<string, unknown>[];
  fail: boolean;
  sql: string[];
  params: unknown[][];
}): SqlConnection {
  return {
    beginTransaction: async () => {},
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
    query: async <T>(sql: string, params: unknown[] = []) => {
      state.sql.push(sql);
      state.params.push(params);
      if (state.fail) throw Object.assign(new Error("database down"), { errno: 1146 });
      return state.rows as T[];
    },
    execute: async () => ({ insertId: 0, affectedRows: 0 }),
  };
}

test("a deleted bank id is missing, and a dead database does not pretend the task is gone", async () => {
  const state = { rows: [], fail: false, sql: [] as string[], params: [] as unknown[][] };
  const missing = await loadBankTaskViews([{ bank: "quiz", id: 9 }], async () => connection(state));
  assert.equal(missing.ok, true);
  if (missing.ok) {
    assert.deepEqual(missing.missing, ["quiz:9"]);
    assert.deepEqual(missing.tasks, {});
  }
  assert.equal(state.sql.some((sql) => sql.includes("9")), false);
  assert.deepEqual(state.params[0], [9]);

  state.fail = true;
  const logged = console.error;
  console.error = () => {};
  const down = await loadBankTaskViews([{ bank: "nmt", id: 3 }], async () => connection(state));
  console.error = logged;
  assert.deepEqual(down, { ok: false });
});

test("bank search keeps the query in parameters", async () => {
  const state = { rows: [], fail: false, sql: [] as string[], params: [] as unknown[][] };
  const found = await searchBankTasks("дроби", async () => connection(state));
  assert.equal(found.ok, true);
  if (found.ok) assert.deepEqual(found.hits, []);
  assert.equal(state.sql.some((sql) => sql.includes("дроби")), false);
  assert.equal(state.params.some((params) => params.includes("дроби")), true);
  assert.equal(state.sql.some((sql) => sql.includes("right_answer")), false);
});
