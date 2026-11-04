import assert from "node:assert/strict";
import test from "node:test";
import catalog from "@/content/workbookProblems.json";
import {
  getWorkbookProblems,
  getWorkbookThemes,
  listWorkbookProblemsFromCatalog,
  listWorkbookThemesFromCatalog,
  resolveWorkbookThemeKey,
} from "./getProblems";

const ZADACHNYK_FIRST_PROMPTS: Record<number, string> = {
  1: "16 + 2 = ?",
  2: "15 + 27 = ?",
  3: "Скільки градусів має прямий кут?",
  4: "Знайдіть суму 1/2 + 1/4.",
  5: "x + 5 > 12",
  6: "2x + 5 = ?",
  7: "Площа прямокутника зі сторонами 8 см і 5 см дорівнює...",
  8: "x + 7 = 15",
  9: "Якщо дві прямі перпендикулярні, кут між ними...",
  10: "Точка A(3; 5) знаходиться у...",
  11: "Що називають функцією?",
  12: "lim(x→2)(x+3)=?",
  13: "Похідна y=x...",
  14: "Первісна y=x...",
  15: "Яка ймовірність випадіння орла при підкиданні монети?",
  16: "sin 30° = ?",
  17: "Скільки способів вибрати 1 предмет із 5?",
  18: "Наступний член прогресії 2, 4, 6, 8...",
  19: "2² = ?",
  20: "Ціна товару 100 грн, знижка 10%. Нова ціна?",
  21: "Скільки граней має куб?",
  22: "Розв'яжіть систему: x+y=5, x−y=1.",
};

test("workbook keeps every zadachnyk task and shows site theme names", () => {
  const themes = listWorkbookThemesFromCatalog();
  const shown = themes.reduce((sum, theme) => sum + theme.taskCount, 0);
  assert.equal(catalog.problems.length, 439);
  assert.equal(shown, 439);
  assert.equal(themes.length, 20);

  const arithmetic = themes.find((theme) => theme.key === "MATH-06-ARITH-OPS");
  assert.equal(arithmetic?.name, "Арифметичні дії");
  assert.equal(arithmetic?.taskCount, 40);
  assert.deepEqual(arithmetic?.jsonIds, [1, 2]);

  const fractions = themes.find((theme) => theme.key === "ALG-08-FRACTIONS");
  assert.equal(fractions?.name, "Дроби");
  assert.deepEqual(fractions?.jsonIds, [4]);
  assert.equal(
    themes.some((theme) => theme.name === "Рівності та нерівності" && theme.jsonIds.includes(4)),
    false,
  );

  const expressions = themes.find((theme) => theme.key === "ALG-07-EXPRESSIONS");
  assert.equal(expressions?.name, "Математичні вирази");

  const progressions = themes.find((theme) => theme.key === "ALG-09-COMB-PROG");
  assert.equal(progressions?.name, "Комбінаторика. Прогресії");
  assert.equal(progressions?.taskCount, 40);
  assert.deepEqual(progressions?.jsonIds, [17, 18]);

  const mixed = themes.find((theme) => theme.key === "json:22");
  assert.equal(mixed?.code, null);
  assert.equal(mixed?.name, "Вища математика");
  assert.equal(mixed?.taskCount, 19);

  assert.deepEqual(
    themes.map((theme) => theme.key),
    [
      "MATH-06-ARITH-OPS",
      "GEO-07-ELEM-PLAN",
      "ALG-09-EQ-INEQ",
      "ALG-08-FRACTIONS",
      "ALG-07-EXPRESSIONS",
      "GEO-07-CALC",
      "ALG-07-EQ",
      "GEO-07-PROOFS",
      "MATH-07-WORD-PROBLEMS",
      "ALG-07-COORD-PLANE",
      "ALG-09-FUNCTIONS",
      "ALG-11-LOGARITHMS",
      "ALG-10-TRIG",
      "ALG-11-LIMITS",
      "ALG-11-DERIVATIVE",
      "ALG-11-INTEGRALS",
      "GEO-10-STEREOMETRY",
      "ALG-09-COMB-PROG",
      "MATH-09-PROBABILITY",
      "json:22",
    ],
  );
});

test("each JSON topic still contains its first task", () => {
  const themes = listWorkbookThemesFromCatalog();
  for (const [idText, first] of Object.entries(ZADACHNYK_FIRST_PROMPTS)) {
    const key = resolveWorkbookThemeKey(themes, idText);
    const problems = listWorkbookProblemsFromCatalog(key ?? "");
    assert.equal(
      problems.some((problem) => problem.problemText === first),
      true,
      `json topic ${idText}`,
    );
  }
});

test("live theme name and ord replace the fallback", () => {
  const themes = listWorkbookThemesFromCatalog([
    { code: "ALG-07-EXPRESSIONS", name: "  Вирази з бази  ", ord: 0 },
    { code: "ALG-08-FRACTIONS", name: "Дроби", ord: 1 },
  ]);
  assert.equal(themes[0]?.key, "ALG-07-EXPRESSIONS");
  assert.equal(themes[0]?.name, "Вирази з бази");
  assert.equal(themes[1]?.key, "ALG-08-FRACTIONS");
  assert.equal(themes.find((theme) => theme.key === "MATH-06-ARITH-OPS")?.name, "Арифметичні дії");
});

test("old numeric links open the mapped code, not themes.id", () => {
  const themes = listWorkbookThemesFromCatalog();
  assert.equal(resolveWorkbookThemeKey(themes, "4"), "ALG-08-FRACTIONS");
  assert.equal(resolveWorkbookThemeKey(themes, "1"), "MATH-06-ARITH-OPS");
  assert.equal(resolveWorkbookThemeKey(themes, "2"), "MATH-06-ARITH-OPS");
  assert.equal(resolveWorkbookThemeKey(themes, "18"), "ALG-09-COMB-PROG");
  assert.equal(resolveWorkbookThemeKey(themes, "22"), "json:22");
  assert.equal(resolveWorkbookThemeKey(themes, "ALG-07-EQ"), "ALG-07-EQ");
  assert.equal(resolveWorkbookThemeKey(themes, "MATH-05-ELEM-OPS"), themes[0]?.key);
  assert.equal(resolveWorkbookThemeKey(themes, "99"), themes[0]?.key);
  assert.equal(resolveWorkbookThemeKey([], "4"), null);
});

test("getWorkbookThemes uses the names it is given and keeps the answer key", async () => {
  const themes = await getWorkbookThemes([
    { code: "ALG-07-EQ", name: "Рівняння", ord: 8 },
  ]);
  assert.equal(themes.find((theme) => theme.key === "ALG-07-EQ")?.name, "Рівняння");

  const problems = await getWorkbookProblems("ALG-07-EQ");
  assert.equal(problems[0]?.problemText, "x + 7 = 15");
  assert.deepEqual(problems[0]?.answers, ["6", "7", "8", "9"]);
  assert.equal(problems[0]?.rightAnswerN, 3);
  assert.equal(problems.length, 20);
});

test("getWorkbookThemes falls back to the map when the theme list fails", async () => {
  const logged = console.error;
  let loggedFallback = false;
  console.error = () => {
    loggedFallback = true;
  };
  try {
    const themes = await getWorkbookThemes(async () => {
      throw new Error("database down");
    });
    assert.equal(themes[0]?.name, "Арифметичні дії");
    assert.equal(themes.find((theme) => theme.key === "ALG-08-FRACTIONS")?.name, "Дроби");
    assert.equal(loggedFallback, true);
  } finally {
    console.error = logged;
  }
});
