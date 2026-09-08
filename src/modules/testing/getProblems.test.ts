import assert from "node:assert/strict";
import test from "node:test";
import type { SqlConnection } from "@/lib/db/mysql";
import {
  getWorkbookProblems,
  getWorkbookThemes,
  listWorkbookProblemsFromCatalog,
  listWorkbookThemesFromCatalog,
} from "./getProblems";
import { resetProblemsSchemaMemo } from "./workbookSchema";

function makeConnection() {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  let released = 0;

  const connection: SqlConnection = {
    beginTransaction: async () => {},
    query: async (sql, params) => {
      calls.push({ sql, params });
      return [] as never[];
    },
    execute: async (sql, params) => {
      calls.push({ sql, params });
      return { insertId: 0, affectedRows: 0 };
    },
    commit: async () => {},
    rollback: async () => {},
    release: () => {
      released += 1;
    },
  };

  return {
    connection,
    calls,
    released: () => released,
  };
}

const ZADACHNYK_FIRST_PROMPTS: Record<number, { name: string; first: string }> =
  {
    1: { name: "Елементарна математика", first: "16+2=?" },
    2: { name: "Арифметика", first: "15 + 27 = ?" },
    3: { name: "Описова геометрія", first: "Скільки градусів має прямий кут?" },
    4: { name: "Дроби", first: "Знайдіть суму 1/2 + 1/4." },
    5: { name: "Рівності та нерівності", first: "x + 5 > 12" },
    6: { name: "Алгебраїчні вирази", first: "2x + 5 = ?" },
    7: {
      name: "Обрахункова геометрія",
      first: "Площа прямокутника зі сторонами 8 см і 5 см дорівнює...",
    },
    8: { name: "Рівняння", first: "x + 7 = 15" },
    9: {
      name: "Доказова геометрія",
      first: "Якщо дві прямі перпендикулярні, кут між ними...",
    },
    10: {
      name: "Координатна площина",
      first: "Точка A(3; 5) знаходиться у...",
    },
    11: { name: "Функція", first: "Що називають функцією?" },
    12: { name: "Границя функції", first: "lim(x→2)(x+3)=?" },
    13: { name: "Похідна функції", first: "Похідна y=x..." },
    14: {
      name: "Первісна функції та інтеграли",
      first: "Первісна y=x...",
    },
    15: {
      name: "Теорія ймовірностей та математична статистика",
      first: "Яка ймовірність випадіння орла при підкиданні монети?",
    },
    16: { name: "Тригонометрія", first: "sin 30° = ?" },
    17: {
      name: "Комбінаторика",
      first: "Скільки способів вибрати 1 предмет із 5?",
    },
    18: {
      name: "Прогресії",
      first: "Наступний член прогресії 2, 4, 6, 8...",
    },
    19: { name: "Експоненти та логарифми", first: "2² = ?" },
    20: {
      name: "Словарні задачі",
      first: "Ціна товару 100 грн, знижка 10%. Нова ціна?",
    },
    21: { name: "Стереометрія", first: "Скільки граней має куб?" },
    22: {
      name: "Вища математика",
      first: "Розв'яжіть систему: x+y=5, x−y=1.",
    },
  };

test("catalog maps all 22 zadachnyk themes to the screenshot first tasks", () => {
  const themes = listWorkbookThemesFromCatalog();
  assert.equal(themes.length, 22);

  for (const [idText, expected] of Object.entries(ZADACHNYK_FIRST_PROMPTS)) {
    const id = Number(idText);
    const theme = themes.find((row) => row.id === id);
    assert.equal(theme?.name, expected.name, `theme ${id} name`);
    const problems = listWorkbookProblemsFromCatalog(id);
    assert.equal(
      problems[0]?.problemText,
      expected.first,
      `theme ${id} first task`,
    );
    assert.equal(theme?.taskCount, id === 22 ? 19 : 20);
    assert.equal(problems.length, theme?.taskCount);
  }
});

test("getWorkbookThemes uses zadachnyk names, not trainer themes", async () => {
  resetProblemsSchemaMemo();
  const mock = makeConnection();

  const themes = await getWorkbookThemes({
    getConnection: async () => mock.connection,
    seedIfEmpty: false,
  });

  assert.equal(themes[0]?.name, "Елементарна математика");
  assert.equal(themes[6]?.name, "Обрахункова геометрія");
  assert.equal(themes[7]?.name, "Рівняння");
  assert.equal(themes[9]?.name, "Координатна площина");
  assert.ok(!mock.calls.some((call) => call.sql.includes("FROM themes")));
  assert.ok(mock.released() >= 1);
});

test("getWorkbookProblems maps rows including the answer key", async () => {
  resetProblemsSchemaMemo();
  const mock = makeConnection();

  const problems = await getWorkbookProblems(8, {
    getConnection: async () => mock.connection,
    seedIfEmpty: false,
  });

  assert.equal(problems[0]?.problemText, "x + 7 = 15");
  assert.deepEqual(problems[0]?.answers, ["6", "7", "8", "9"]);
  assert.equal(problems[0]?.rightAnswerN, 3);
});
