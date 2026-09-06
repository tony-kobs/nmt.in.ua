import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateQuizTasksDataset,
  validateThemeConnectionsDataset,
  validateThemesDataset,
  type RawRow,
} from "./validate";

function row(rowLabel: string, raw: Record<string, unknown>): RawRow {
  return { rowLabel, raw };
}

test("validateThemesDataset accepts a well-formed row", () => {
  const result = validateThemesDataset([
    row("themes row 2", {
      id: "1",
      name: "Algebra",
      description: "Basics",
      ord: "1",
    }),
  ]);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.records, [
    { id: 1, name: "Algebra", description: "Basics", ord: 1 },
  ]);
});

test("validateThemesDataset rejects an empty dataset", () => {
  const result = validateThemesDataset([]);
  assert.deepEqual(result.errors, ["themes: dataset is empty"]);
});

test("validateThemesDataset rejects unknown and missing fields", () => {
  const result = validateThemesDataset([
    row("themes row 2", { id: "1", name: "x", ord: "1", extra: "y" }),
  ]);
  assert.equal(result.records.length, 0);
  assert.ok(result.errors.some((e) => e.includes("unknown field(s): extra")));
  assert.ok(
    result.errors.some((e) => e.includes("missing field(s): description")),
  );
});

test("validateThemesDataset rejects a non-integer id", () => {
  const result = validateThemesDataset([
    row("themes row 2", { id: "abc", name: "x", description: "y", ord: "1" }),
  ]);
  assert.ok(result.errors.some((e) => e.includes("id must be an integer")));
});

test("validateThemesDataset rejects an oversized name", () => {
  const result = validateThemesDataset([
    row("themes row 2", {
      id: "1",
      name: "x".repeat(101),
      description: "y",
      ord: "1",
    }),
  ]);
  assert.ok(
    result.errors.some((e) =>
      e.includes("name must be at most 100 characters"),
    ),
  );
});

test("validateThemesDataset rejects duplicate ids within the dataset", () => {
  const result = validateThemesDataset([
    row("themes row 2", { id: "1", name: "a", description: "d", ord: "1" }),
    row("themes row 3", { id: "1", name: "b", description: "d", ord: "2" }),
  ]);
  assert.ok(result.errors.some((e) => e.includes("duplicate id 1")));
});

test("validateThemesDataset accepts ord = 0 (a valid ordinal position)", () => {
  const result = validateThemesDataset([
    row("themes row 2", {
      id: "1",
      name: "Algebra",
      description: "Basics",
      ord: "0",
    }),
  ]);
  assert.deepEqual(result.errors, []);
  assert.equal(result.records[0].ord, 0);
});

test("validateThemesDataset rejects a negative ord", () => {
  const result = validateThemesDataset([
    row("themes row 2", {
      id: "1",
      name: "Algebra",
      description: "Basics",
      ord: "-1",
    }),
  ]);
  assert.ok(
    result.errors.some((e) => e.includes("ord must be a non-negative integer")),
  );
});

test("validateThemesDataset rejects id = 0 (primary IDs must be positive)", () => {
  const result = validateThemesDataset([
    row("themes row 2", {
      id: "0",
      name: "Algebra",
      description: "Basics",
      ord: "1",
    }),
  ]);
  assert.ok(
    result.errors.some((e) => e.includes("id must be a positive integer")),
  );
});

test("validateThemesDataset rejects a negative id", () => {
  const result = validateThemesDataset([
    row("themes row 2", {
      id: "-1",
      name: "Algebra",
      description: "Basics",
      ord: "1",
    }),
  ]);
  assert.ok(
    result.errors.some((e) => e.includes("id must be a positive integer")),
  );
});

test("validateThemesDataset rejects an id one past the MySQL INT upper bound", () => {
  const result = validateThemesDataset([
    row("themes row 2", {
      id: "2147483648",
      name: "Algebra",
      description: "Basics",
      ord: "1",
    }),
  ]);
  assert.ok(
    result.errors.some((e) =>
      e.includes("id must be between -2147483648 and 2147483647"),
    ),
  );
});

test("validateThemeConnectionsDataset rejects a zero vertex_start (foreign references must be positive)", () => {
  const result = validateThemeConnectionsDataset([
    row("themeConnections[0]", { id: 1, vertex_start: 0, vertex_finish: 3 }),
  ]);
  assert.ok(
    result.errors.some((e) =>
      e.includes("vertex_start must be a positive integer"),
    ),
  );
});

test("validateThemeConnectionsDataset accepts JSON-typed integers directly", () => {
  const result = validateThemeConnectionsDataset([
    row("themeConnections[0]", { id: 1, vertex_start: 2, vertex_finish: 3 }),
  ]);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.records, [
    { id: 1, vertexStart: 2, vertexFinish: 3 },
  ]);
});

function validQuizTaskRaw(overrides: Record<string, unknown> = {}) {
  return {
    id: "1",
    name: "Q1",
    task_text: "What is 2+2?",
    theme_id: "1",
    answer_1: "3",
    answer_2: "4",
    answer_3: "5",
    answer_4: "6",
    right_answer_n: "2",
    comments: "easy",
    difficulty: "1",
    ...overrides,
  };
}

test("validateQuizTasksDataset accepts a well-formed row", () => {
  const result = validateQuizTasksDataset([
    row("quizTasks row 2", validQuizTaskRaw()),
  ]);
  assert.deepEqual(result.errors, []);
  assert.equal(result.records[0].rightAnswerN, 2);
});

test("validateQuizTasksDataset rejects right_answer_n outside 1..4", () => {
  const result = validateQuizTasksDataset([
    row("quizTasks row 2", validQuizTaskRaw({ right_answer_n: "5" })),
  ]);
  assert.ok(
    result.errors.some((e) =>
      e.includes("right_answer_n must be between 1 and 4"),
    ),
  );
});

test("validateQuizTasksDataset rejects a non-integer right_answer_n", () => {
  const result = validateQuizTasksDataset([
    row("quizTasks row 2", validQuizTaskRaw({ right_answer_n: "two" })),
  ]);
  assert.ok(
    result.errors.some((e) => e.includes("right_answer_n must be an integer")),
  );
});

test("validateQuizTasksDataset rejects a negative theme_id (foreign reference must be positive)", () => {
  const result = validateQuizTasksDataset([
    row("quizTasks row 2", validQuizTaskRaw({ theme_id: "-1" })),
  ]);
  assert.ok(
    result.errors.some((e) =>
      e.includes("theme_id must be a positive integer"),
    ),
  );
});

test("validateQuizTasksDataset rejects an oversized answer", () => {
  const result = validateQuizTasksDataset([
    row("quizTasks row 2", validQuizTaskRaw({ answer_1: "x".repeat(256) })),
  ]);
  assert.ok(
    result.errors.some((e) =>
      e.includes("answer_1 must be at most 255 characters"),
    ),
  );
});

test("validateQuizTasksDataset rejects difficulty outside 1..3", () => {
  const result = validateQuizTasksDataset([
    row("quizTasks row 2", validQuizTaskRaw({ difficulty: "4" })),
  ]);

  assert.ok(
    result.errors.some((error) =>
      error.includes("difficulty must be between 1 and 3"),
    ),
  );
});
