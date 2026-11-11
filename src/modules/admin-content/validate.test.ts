import assert from "node:assert/strict";
import test from "node:test";

import { AdminContentError } from "./types";
import {
  deriveTaskName,
  normalizeTaskParamValues,
  parseAdminQuizTaskInput,
  parseTaskId,
  parseTaskParamDrafts,
  parseThemeId,
  parseThemeLevelForm,
  parseThemeParamInput,
  suggestParamCode,
  uniqueParamCode,
} from "./validate";

test("parseAdminQuizTaskInput derives name from task text when omitted", () => {
  const input = parseAdminQuizTaskInput({
    taskText: "10+10=",
    themeId: "2",
    answer1: "10",
    answer2: "20",
    answer3: "30",
    answer4: "0",
    rightAnswerN: "2",
    difficulty: "3",
    comments: " hint ",
  } as Record<string, unknown>);

  assert.deepEqual(input, {
    name: "10+10=",
    taskText: "$10+10=$",
    themeId: 2,
    answer1: "$10$",
    answer2: "$20$",
    answer3: "$30$",
    answer4: "$0$",
    rightAnswerN: 2,
    comments: "hint",
    difficulty: 3,
  });
});

test("parseAdminQuizTaskInput keeps an explicit name from imports", () => {
  const input = parseAdminQuizTaskInput({
    name: " Додавання ",
    taskText: "10+10=",
    themeId: "2",
    answer1: "10",
    answer2: "20",
    answer3: "30",
    answer4: "0",
    rightAnswerN: "2",
    difficulty: "3",
  } as Record<string, unknown>);

  assert.equal(input.name, "Додавання");
});

test("parseAdminQuizTaskInput accepts difficulty above 3", () => {
  const input = parseAdminQuizTaskInput({
    taskText: "B",
    themeId: 1,
    answer1: "1",
    answer2: "2",
    answer3: "3",
    answer4: "4",
    rightAnswerN: 1,
    difficulty: 10,
  });

  assert.equal(input.difficulty, 10);
  assert.equal(input.name, "B");
});

test("deriveTaskName strips math dollars and truncates", () => {
  assert.equal(deriveTaskName("$a+b$ = ?"), "a+b = ?");
  assert.equal(deriveTaskName("x".repeat(120)).length, 100);
});

test("parseThemeId and parseTaskId require positive ints", () => {
  assert.equal(parseThemeId("7"), 7);
  assert.equal(parseTaskId(12), 12);
  assert.throws(() => parseTaskId("0"), AdminContentError);
  assert.throws(() => parseThemeId("-1"), AdminContentError);
});

test("suggestParamCode transliterates theme parameter names", () => {
  assert.equal(suggestParamCode("Модуль"), "modul");
  assert.equal(suggestParamCode("Степені"), "stepeni");
  assert.equal(suggestParamCode("Звичайні дроби"), "zvychaini_droby");
  assert.equal(suggestParamCode("Десяткові дроби"), "desiatkovi_droby");
  assert.equal(suggestParamCode("Кількість дій"), "kilkist_dii");
  assert.equal(suggestParamCode("   "), "param");
});

test("uniqueParamCode skips codes already used in the theme", () => {
  const taken = new Set(["modul", "modul_2"]);
  assert.equal(uniqueParamCode("modul", taken), "modul_3");
  assert.equal(uniqueParamCode("droby", taken), "droby");
});

test("parseThemeParamInput derives an empty code and rejects a bad type", () => {
  assert.deepEqual(
    parseThemeParamInput({
      themeId: "5",
      name: " Звичайні дроби ",
      code: "",
      valueType: "bool",
    }),
    {
      themeId: 5,
      name: "Звичайні дроби",
      code: "zvychaini_droby",
      valueType: "bool",
    },
  );
  assert.throws(
    () =>
      parseThemeParamInput({
        themeId: 5,
        name: "Кількість",
        code: "Кількість",
        valueType: "int",
      }),
    (error: unknown) => error instanceof AdminContentError && error.code === "invalid_input",
  );
});

test("normalizeTaskParamValues keeps this theme only and rejects a negative int", () => {
  const theme = [
    { id: 1, valueType: "bool" as const },
    { id: 2, valueType: "int" as const },
  ];
  assert.deepEqual(
    normalizeTaskParamValues(
      [
        { paramId: 1, raw: "1" },
        { paramId: 2, raw: "0" },
      ],
      theme,
    ),
    [
      { paramId: 1, intValue: 1 },
      { paramId: 2, intValue: 0 },
    ],
  );
  assert.deepEqual(
    normalizeTaskParamValues([{ paramId: 1, raw: "0" }, { paramId: 2, raw: "  " }], theme),
    [{ paramId: 1, intValue: 0 }],
  );
  assert.throws(
    () => normalizeTaskParamValues([{ paramId: 9, raw: "1" }], theme),
    (error: unknown) => error instanceof AdminContentError && error.code === "invalid_input",
  );
  assert.throws(
    () => normalizeTaskParamValues([{ paramId: 2, raw: "-1" }], theme),
    (error: unknown) => error instanceof AdminContentError && error.code === "invalid_input",
  );
});

test("parseThemeLevelForm keeps enabled rules and refuses a level with none", () => {
  const data = new FormData();
  data.set("themeId", "5");
  data.set("name", " звичайні дроби, без модуля, 2–3 дії ");
  data.set("rule.1.on", "1");
  data.set("rule.1.bool", "1");
  data.set("rule.3.on", "1");
  data.set("rule.3.min", "2");
  data.set("rule.3.max", "3");
  data.set("rule.2.bool", "0");
  assert.deepEqual(parseThemeLevelForm(data), {
    themeId: 5,
    name: "звичайні дроби, без модуля, 2–3 дії",
    rules: [
      { paramId: 1, boolValue: 1, intMin: null, intMax: null },
      { paramId: 3, boolValue: null, intMin: 2, intMax: 3 },
    ],
  });

  const empty = new FormData();
  empty.set("themeId", "5");
  empty.set("name", "Порожній");
  assert.throws(
    () => parseThemeLevelForm(empty),
    (error: unknown) =>
      error instanceof AdminContentError && error.code === "rules_required",
  );
});

test("parseTaskParamDrafts lets the later checkbox value win", () => {
  const data = new FormData();
  data.append("param.4", "0");
  data.append("param.4", "1");
  data.append("taskText", "ignore");
  assert.deepEqual(parseTaskParamDrafts(data), [{ paramId: 4, raw: "1" }]);
});
