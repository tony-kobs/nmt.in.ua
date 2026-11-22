import assert from "node:assert/strict";
import test from "node:test";
import type { SqlConnection } from "@/lib/db/mysql";
import {
  BANK_SEARCH_SQL,
  BANK_THEMES_SQL,
  COPY_DAY_TASK_SQL,
  bankPreviewSql,
  listBankThemes,
  pickBankIds,
  planBankAdd,
  planDayTaskCreate,
  quizBankMatchesSubject,
  sameQuestionSet,
  sampleThemePreviews,
  searchBankTasks,
  toBankPreview,
  validateInlineEdit,
} from "./taskBank";

test("creating a day task stays on the day unless the bank checkbox asks for four options", () => {
  const dayOnly = planDayTaskCreate({
    prompt: "Скільки буде 2+2?",
    options: ["3", "4"],
    correct: 2,
    explanation: "",
    saveToBank: false,
    themeId: null,
    difficulty: null,
  });
  assert.equal(dayOnly.ok, true);
  if (dayOnly.ok) assert.equal(dayOnly.mode, "day");
  const shortBank = planDayTaskCreate({
    prompt: "Скільки буде 2+2?",
    options: ["3", "4"],
    correct: 2,
    explanation: "",
    saveToBank: true,
    themeId: 5,
    difficulty: 1,
  });
  assert.deepEqual(shortBank, { ok: false, reason: "bank_fields" });
  const bank = planDayTaskCreate({
    prompt: "Скільки буде 2+2?",
    options: ["3", "4", "5", "6"],
    correct: 2,
    explanation: "бо 4",
    saveToBank: true,
    themeId: 5,
    difficulty: 1,
  });
  assert.equal(bank.ok, true);
  if (bank.ok) {
    assert.equal(bank.mode, "bank");
    assert.equal(bank.themeId, 5);
  }
});

test("a day copy validates like import and never updates the question bank", () => {
  assert.match(COPY_DAY_TASK_SQL, /UPDATE marathon_day_tasks/);
  assert.match(COPY_DAY_TASK_SQL, /question_id = NULL/);
  assert.doesNotMatch(COPY_DAY_TASK_SQL, /quiz_tasks/);
  const ok = validateInlineEdit({
    prompt: "Скільки буде 2+2?",
    options: ["3", "4", ""],
    correct: 2,
    explanation: "",
  });
  assert.equal(ok.ok, true);
  if (!ok.ok) return;
  assert.deepEqual(ok.options, ["3", "4"]);
  assert.equal(validateInlineEdit({
    prompt: "x",
    options: ["1", "1"],
    correct: 3,
    explanation: "",
  }).ok, false);
});

test("adding bank tasks skips duplicates on this day and reports other days", () => {
  const plan = planBankAdd([5], [5, 5, 8, 9], new Map([[9, [2]]]));
  assert.deepEqual(plan.add, [8, 9]);
  assert.deepEqual(plan.duplicateHere, [5]);
  assert.deepEqual(plan.elsewhere, [{ id: 9, days: [2] }]);
});

test("the admin search is ordered and does not read the answer key", () => {
  assert.doesNotMatch(BANK_SEARCH_SQL, /RAND/i);
  assert.doesNotMatch(BANK_SEARCH_SQL, /right_answer_n/);
  assert.match(BANK_SEARCH_SQL, /ORDER BY t\.ord ASC, q\.id ASC/);
  assert.match(BANK_SEARCH_SQL, /q\.difficulty/);
  assert.doesNotMatch(BANK_SEARCH_SQL, /REPLACE\(/);
  assert.doesNotMatch(BANK_SEARCH_SQL, /REGEXP/i);
  assert.doesNotMatch(BANK_SEARCH_SQL, /OFFSET/);
});

test("sameQuestionSet ignores order and rejects duplicates", () => {
  assert.equal(sameQuestionSet([3, 1, 2], [1, 2, 3]), true);
  assert.equal(sameQuestionSet([1, 2], [1, 2, 3]), false);
  assert.equal(sameQuestionSet([1, 1], [1, 1]), false);
});

test("quiz bank is the math catalog only", () => {
  assert.equal(quizBankMatchesSubject("math"), true);
  assert.equal(quizBankMatchesSubject(" Math "), true);
  assert.equal(quizBankMatchesSubject("physics"), false);
  assert.equal(quizBankMatchesSubject(""), false);
});

test("pickBankIds skips excluded ids and stays inside the pool", () => {
  const picked = pickBankIds([1, 2, 3, 4, 5, 5], 3, [1, 2]);
  assert.equal(picked.length, 3);
  assert.equal(new Set(picked).size, 3);
  assert.ok(picked.every((id) => id >= 3 && id <= 5));
});

test("pickBankIds returns the whole remainder when the topic is smaller", () => {
  const picked = pickBankIds([8, 9], 20, []);
  assert.deepEqual(picked.slice().sort((a, b) => a - b), [8, 9]);
});

test("preview SQL does not read the answer key", () => {
  const sql = bankPreviewSql(2);
  assert.match(sql, /task_text/);
  assert.match(sql, /id IN \(\?, \?\)/);
  assert.doesNotMatch(sql, /right_answer_n/);
  assert.doesNotMatch(sql, /comments/);
  assert.doesNotMatch(BANK_THEMES_SQL, /right_answer_n/);
});

test("toBankPreview keeps prompt and options and drops a key if one was selected", () => {
  const preview = toBankPreview({
    id: 4,
    name: "name",
    task_text: "Скільки буде 2+2?",
    answer_1: "3",
    answer_2: "4",
    answer_3: " ",
    answer_4: null,
    right_answer_n: 2,
  } as Parameters<typeof toBankPreview>[0] & { right_answer_n: number });
  assert.deepEqual(preview, {
    id: 4,
    prompt: "Скільки буде 2+2?",
    options: ["3", "4"],
  });
  assert.equal("right_answer_n" in preview, false);
});

test("search reads every filtered row and pages the normalized matches", async () => {
  const rows = [
    {
      id: 9,
      name: "степінь",
      task_text: "Обчисліть $x^{2}$.",
      answer_1: "1",
      answer_2: "2",
      answer_3: null,
      answer_4: null,
      theme_name: "Степені",
      difficulty: 2,
      other_days: "3",
    },
    {
      id: 10,
      name: "сума",
      task_text: "Скільки буде 2 + 2?",
      answer_1: "3",
      answer_2: "4",
      answer_3: null,
      answer_4: null,
      theme_name: "Арифметика",
      difficulty: 1,
      other_days: null,
    },
  ];
  const connection: SqlConnection = {
    beginTransaction: async () => undefined,
    commit: async () => undefined,
    rollback: async () => undefined,
    release: () => undefined,
    execute: async () => ({ affectedRows: 0, insertId: 0 }),
    query: async <T,>(sql: string) => {
      assert.doesNotMatch(sql, /REPLACE\(/);
      assert.doesNotMatch(sql, /OFFSET/);
      return rows as T[];
    },
  };
  const browse = await searchBankTasks(
    { subject: "math", themeId: null, query: "", page: 1 },
    async () => connection,
  );
  assert.equal(browse.total, 2);
  assert.equal(browse.page, 1);
  const found = await searchBankTasks(
    { subject: "math", themeId: null, query: "  X^{2}  ", page: 1 },
    async () => connection,
  );
  assert.equal(found.total, 1);
  assert.equal(found.tasks[0]?.id, 9);
  const letter = await searchBankTasks(
    { subject: "math", themeId: null, query: "у", page: 1 },
    async () => connection,
  );
  assert.equal(letter.total, 1);
  assert.equal(letter.tasks[0]?.id, 10);
});

test("a non-math subject does not query the bank", async () => {
  let called = false;
  const themes = await listBankThemes("history", async () => {
    called = true;
    throw new Error("should not connect");
  });
  assert.deepEqual(themes, []);
  assert.equal(called, false);
});

test("sampleThemePreviews returns prompt text without the key column", async () => {
  const calls: string[] = [];
  const connection: SqlConnection = {
    beginTransaction: async () => undefined,
    commit: async () => undefined,
    rollback: async () => undefined,
    release: () => undefined,
    execute: async () => ({ affectedRows: 0, insertId: 0 }),
    query: async <T,>(sql: string) => {
      calls.push(sql);
      if (sql.includes("SELECT id FROM quiz_tasks")) {
        return [{ id: 10 }, { id: 11 }] as T[];
      }
      assert.doesNotMatch(sql, /right_answer_n/);
      return [
        {
          id: 10,
          name: "n",
          task_text: "Питання",
          answer_1: "а",
          answer_2: "б",
          answer_3: null,
          answer_4: null,
        },
      ] as T[];
    },
  };
  const questions = await sampleThemePreviews(
    { subject: "math", themeId: 3, count: 1, excludeIds: [11] },
    async () => connection,
  );
  assert.equal(questions.length, 1);
  assert.equal(questions[0]?.id, 10);
  assert.equal(questions[0]?.prompt, "Питання");
  assert.deepEqual(Object.keys(questions[0] ?? {}).sort(), ["id", "options", "prompt"]);
  assert.ok(calls.some((sql) => sql.includes("answer_1")));
});
