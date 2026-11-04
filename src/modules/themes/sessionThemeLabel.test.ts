import assert from "node:assert/strict";
import test from "node:test";

import { sessionThemeLabel } from "./sessionThemeLabel";

test("sessionThemeLabel keeps a joined theme name", () => {
  assert.equal(
    sessionThemeLabel({ themeName: " Дроби ", themeId: 5, sessionType: 1 }),
    "Дроби",
  );
});

test("sessionThemeLabel names a kept attempt of the retired theme", () => {
  assert.equal(
    sessionThemeLabel({ themeName: null, themeId: 1, sessionType: 1 }),
    "Елементарні дії",
  );
  assert.equal(
    sessionThemeLabel({ themeName: "  ", themeId: 1, sessionType: 1 }),
    "Елементарні дії",
  );
});

test("sessionThemeLabel does not call a diagnostic or simulator attempt a missing topic", () => {
  assert.equal(
    sessionThemeLabel({ themeName: null, themeId: null, sessionType: 5 }),
    "Загальна діагностика",
  );
  assert.equal(
    sessionThemeLabel({ themeName: null, themeId: 0, sessionType: 4, variantLabel: " 2025 · Основна " }),
    "2025 · Основна",
  );
  assert.equal(
    sessionThemeLabel({ themeName: null, themeId: null, sessionType: 4 }),
    "Симулятор НМТ",
  );
});

test("sessionThemeLabel uses a generic label for any other missing theme", () => {
  assert.equal(
    sessionThemeLabel({ themeName: null, themeId: 9, sessionType: 1 }),
    "Тема недоступна",
  );
});
