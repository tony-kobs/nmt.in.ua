import assert from "node:assert/strict";
import test from "node:test";
import type { SqlConnection } from "@/lib/db/mysql";
import {
  BANK_THEMES_SQL,
  bankPreviewSql,
  listBankThemes,
  pickBankIds,
  quizBankMatchesSubject,
  sampleThemePreviews,
  toBankPreview,
} from "./taskBank";

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
