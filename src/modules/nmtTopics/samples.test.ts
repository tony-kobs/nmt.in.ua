import assert from "node:assert/strict";
import test from "node:test";
import { pickSampleRows, presentSampleTask, type SampleTaskRow } from "./samples";
import { topicIntro } from "./pageModel";

function row(patch: Partial<SampleTaskRow> = {}): SampleTaskRow {
  return {
    id: 1,
    name: "НМТ 2024 №3",
    task_text: "Обчисліть $2+2$.",
    answer_1: "3",
    answer_2: "4",
    answer_3: "5",
    answer_4: null,
    answer_5: null,
    task_kind: "mcq",
    source_url: "https://testportal.gov.ua/demo",
    year: 2024,
    label: "Демонстраційний варіант",
    source_note: "УЦОЯО",
    ...patch,
  };
}

test("sample card keeps options and source, and drops the key", () => {
  const card = presentSampleTask(row());
  assert.equal(card.kind, "mcq");
  assert.deepEqual(
    card.options.map((option) => option.letter),
    ["А", "Б", "В"],
  );
  assert.equal(card.sourceLabel, "НМТ 2024 · Демонстраційний варіант · УЦОЯО");
  assert.equal(card.sourceUrl, "https://testportal.gov.ua/demo");
  assert.equal("right" in card, false);
  assert.equal(JSON.stringify(card).includes("comments"), false);
  const http = presentSampleTask(row({ source_url: "http://evil.test/a" }));
  assert.equal(http.sourceUrl, null);
  const open = presentSampleTask(row({ task_kind: "open", answer_1: "4" }));
  assert.equal(open.kind, "open");
  assert.deepEqual(open.options, []);
});

test("pickSampleRows keeps the first three distinct ids", () => {
  const rows = [row({ id: 1 }), row({ id: 1, year: 2023 }), row({ id: 2 }), row({ id: 3 }), row({ id: 4 })];
  assert.deepEqual(pickSampleRows(rows).map((item) => item.id), [1, 2, 3]);
});

test("topic intro prefers the conspect, then a long description, else counts", () => {
  const book = topicIntro({
    code: "ALG-08-FRACTIONS",
    description: null,
    taskCount: 10,
    levels: [],
  });
  assert.equal(book.kind, "text");
  const described = topicIntro({
    code: "ALG-08-QUAD-EQ",
    description: "Квадратне рівняння має вигляд ax² + bx + c = 0, де a не дорівнює нулю. Це окремий розділ алгебри 8 класу.",
    taskCount: 4,
    levels: ["Базовий"],
  });
  assert.equal(described.kind, "text");
  const counts = topicIntro({
    code: "ALG-08-QUAD-EQ",
    description: "",
    taskCount: 0,
    levels: ["Базовий", "Поглиблений"],
  });
  assert.deepEqual(counts, {
    kind: "counts",
    taskCount: 0,
    levels: ["Базовий", "Поглиблений"],
  });
});
