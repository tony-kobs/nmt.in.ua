import assert from "node:assert/strict";
import test from "node:test";

import type { SqlConnection } from "@/lib/db/mysql";
import { createQuizTask, getQuizTaskById, updateQuizTask } from "./store";
import { deleteThemeParam, replaceQuizTaskParams, updateThemeParam } from "./themeParams";
import { AdminContentError } from "./types";

function scripted(handlers: {
  query?: (sql: string, params?: unknown[]) => unknown[];
  execute?: (
    sql: string,
    params?: unknown[],
  ) => { insertId: number; affectedRows: number } | Promise<{ insertId: number; affectedRows: number }>;
}) {
  const executed: { sql: string; params?: unknown[] }[] = [];
  const state = { begun: false, committed: false, rolledBack: false, released: false };
  const connection: SqlConnection = {
    beginTransaction: async () => {
      state.begun = true;
    },
    commit: async () => {
      state.committed = true;
    },
    rollback: async () => {
      state.rolledBack = true;
    },
    release: () => {
      state.released = true;
    },
    query: async <T = unknown>(sql: string, params?: unknown[]) =>
      (handlers.query ? handlers.query(sql, params) : []) as T[],
    execute: async (sql, params) => {
      executed.push({ sql, params });
      return handlers.execute
        ? handlers.execute(sql, params)
        : { insertId: 1, affectedRows: 1 };
    },
  };
  return { connection, executed, state };
}

const taskInput = {
  name: "Дроби",
  taskText: "1/2",
  themeId: 5,
  answer1: "1",
  answer2: "2",
  answer3: "3",
  answer4: "4",
  rightAnswerN: 1,
  comments: "",
  difficulty: 2,
};

test("deleteThemeParam removes the parameter together with its task values", async () => {
  const db = scripted({
    query: (sql) => {
      if (sql.includes("FOR UPDATE")) return [{ id: 7, usage_count: 3 }];
      return [];
    },
  });
  const result = await deleteThemeParam(5, 7, {
    getConnection: async () => db.connection,
  });
  assert.deepEqual(result, { usageCount: 3 });
  assert.equal(db.state.committed, true);
  assert.equal(db.state.rolledBack, false);
  assert.match(db.executed[0]?.sql ?? "", /DELETE FROM quiz_task_params WHERE param_id/);
  assert.deepEqual(db.executed[0]?.params, [7]);
  assert.match(db.executed[1]?.sql ?? "", /DELETE FROM theme_params/);
  assert.deepEqual(db.executed[1]?.params, [7, 5]);
});

test("updateThemeParam refuses a type change while tasks store values", async () => {
  const db = scripted({
    query: () => [{ id: 4, value_type: "bool", usage_count: 2 }],
  });
  await assert.rejects(
    () =>
      updateThemeParam(
        {
          themeId: 5,
          paramId: 4,
          name: "Модуль",
          code: "modul",
          valueType: "int",
        },
        { getConnection: async () => db.connection },
      ),
    (error: unknown) => error instanceof AdminContentError && error.code === "type_locked",
  );
  assert.equal(db.executed.length, 0);
  assert.equal(db.state.rolledBack, true);
  assert.equal(db.state.committed, false);
});

test("updateThemeParam changes the type when nothing uses the parameter", async () => {
  const db = scripted({
    query: () => [{ id: 4, value_type: "bool", usage_count: 0 }],
  });
  const saved = await updateThemeParam(
    {
      themeId: 5,
      paramId: 4,
      name: "Кількість дій",
      code: "kilkist_dii",
      valueType: "int",
    },
    { getConnection: async () => db.connection },
  );
  assert.equal(saved.valueType, "int");
  assert.equal(saved.usageCount, 0);
  assert.match(db.executed[0]?.sql ?? "", /UPDATE theme_params/);
  assert.equal(db.state.committed, true);
});

test("replaceQuizTaskParams rejects another theme before deleting values", async () => {
  const db = scripted({
    query: () => [{ id: 1, value_type: "bool" }],
  });
  await assert.rejects(
    () =>
      replaceQuizTaskParams(db.connection, 20, 5, [{ paramId: 99, raw: "1" }]),
    (error: unknown) => error instanceof AdminContentError && error.code === "invalid_input",
  );
  assert.equal(db.executed.length, 0);
});

test("replaceQuizTaskParams stores bool 0/1 and skips an empty int", async () => {
  const db = scripted({
    query: () => [
      { id: 1, value_type: "bool" },
      { id: 2, value_type: "int" },
    ],
  });
  const saved = await replaceQuizTaskParams(db.connection, 20, 5, [
    { paramId: 1, raw: "1" },
    { paramId: 2, raw: "" },
  ]);
  assert.deepEqual(saved, [{ paramId: 1, intValue: 1 }]);
  assert.match(db.executed[0]?.sql ?? "", /DELETE FROM quiz_task_params WHERE task_id/);
  assert.deepEqual(db.executed[0]?.params, [20]);
  assert.match(db.executed[1]?.sql ?? "", /INSERT INTO quiz_task_params/);
  assert.deepEqual(db.executed[1]?.params, [20, 1, 1]);
  assert.equal(db.executed.length, 2);
});

test("createQuizTask writes parameter values and rolls back a foreign parameter", async () => {
  const ok = scripted({
    query: (sql) => {
      if (sql.includes("next_id")) return [{ next_id: 20 }];
      if (sql.includes("value_type")) {
        return [
          { id: 1, value_type: "bool" },
          { id: 2, value_type: "int" },
        ];
      }
      if (sql.includes("FROM themes")) return [{ id: 5 }];
      return [];
    },
  });
  const created = await createQuizTask(
    {
      ...taskInput,
      paramDrafts: [
        { paramId: 1, raw: "1" },
        { paramId: 2, raw: "4" },
      ],
    },
    { getConnection: async () => ok.connection },
  );
  assert.equal(created.id, 20);
  assert.deepEqual(created.params, [
    { paramId: 1, intValue: 1 },
    { paramId: 2, intValue: 4 },
  ]);
  assert.equal(ok.state.committed, true);
  assert.match(ok.executed.at(-1)?.sql ?? "", /INSERT INTO quiz_task_params/);
  assert.deepEqual(ok.executed.at(-1)?.params, [20, 2, 4]);

  const bad = scripted({
    query: (sql) => {
      if (sql.includes("next_id")) return [{ next_id: 21 }];
      if (sql.includes("value_type")) return [{ id: 1, value_type: "bool" }];
      if (sql.includes("FROM themes")) return [{ id: 5 }];
      return [];
    },
  });
  await assert.rejects(
    () =>
      createQuizTask(
        { ...taskInput, paramDrafts: [{ paramId: 99, raw: "1" }] },
        { getConnection: async () => bad.connection },
      ),
    (error: unknown) => error instanceof AdminContentError && error.code === "invalid_input",
  );
  assert.equal(bad.state.committed, false);
  assert.equal(bad.state.rolledBack, true);
});

test("updateQuizTask still stores parameters when the task row itself is unchanged", async () => {
  let taskLookups = 0;
  const db = scripted({
    query: (sql) => {
      if (sql.includes("FROM themes")) return [{ id: 5 }];
      if (sql.includes("value_type")) return [{ id: 1, value_type: "bool" }];
      if (sql.includes("FROM quiz_tasks")) {
        taskLookups += 1;
        return [{ id: 20 }];
      }
      return [];
    },
    execute: (sql) => ({
      insertId: 0,
      affectedRows: sql.includes("UPDATE quiz_tasks") ? 0 : 1,
    }),
  });
  const saved = await updateQuizTask(
    20,
    { ...taskInput, paramDrafts: [{ paramId: 1, raw: "0" }] },
    { getConnection: async () => db.connection },
  );
  assert.equal(taskLookups, 1);
  assert.deepEqual(saved.params, [{ paramId: 1, intValue: 0 }]);
  assert.equal(db.state.committed, true);
  assert.match(
    db.executed.map((call) => call.sql).join("\n"),
    /INSERT INTO quiz_task_params/,
  );
});

test("getQuizTaskById reloads stored parameter values", async () => {
  const db = scripted({
    query: (sql) => {
      if (sql.includes("FROM quiz_tasks")) {
        return [
          {
            id: 20,
            name: "Дроби",
            task_text: "1/2",
            theme_id: 5,
            answer_1: "1",
            answer_2: "2",
            answer_3: "3",
            answer_4: "4",
            right_answer_n: 1,
            comments: "",
            difficulty: 2,
          },
        ];
      }
      if (sql.includes("FROM quiz_task_params")) {
        return [{ param_id: 1, int_value: 1 }];
      }
      return [];
    },
  });
  const task = await getQuizTaskById(20, { getConnection: async () => db.connection });
  assert.deepEqual(task?.params, [{ paramId: 1, intValue: 1 }]);
  assert.equal(task?.themeId, 5);
});
