import { test } from "node:test";
import assert from "node:assert/strict";
import { parseImportJsonDocument } from "./json";

const VALID_DOC = JSON.stringify({
  themes: [{ id: 1, name: "A", description: "d", ord: 1 }],
  themeConnections: [{ id: 1, vertex_start: 1, vertex_finish: 1 }],
  quizTasks: [
    {
      id: 1,
      name: "Q",
      task_text: "t",
      theme_id: 1,
      answer_1: "a",
      answer_2: "b",
      answer_3: "c",
      answer_4: "d",
      right_answer_n: 1,
      comments: "c",
    },
  ],
});

test("parseImportJsonDocument accepts a document without optional problems", () => {
  const result = parseImportJsonDocument(VALID_DOC);
  assert.deepEqual(result.errors, []);
  assert.ok(result.document);
  assert.equal(result.document!.themes.length, 1);
  assert.equal(result.document!.problems.length, 0);
});

test("parseImportJsonDocument accepts an explicit empty problems array", () => {
  const doc = JSON.parse(VALID_DOC);
  doc.problems = [];
  const result = parseImportJsonDocument(JSON.stringify(doc));
  assert.deepEqual(result.errors, []);
  assert.equal(result.document!.problems.length, 0);
});

test("parseImportJsonDocument rejects malformed JSON", () => {
  const result = parseImportJsonDocument("{not json");
  assert.equal(result.document, undefined);
  assert.ok(result.errors[0].includes("malformed JSON payload"));
});

test("parseImportJsonDocument rejects a non-object top level", () => {
  const result = parseImportJsonDocument("[1,2,3]");
  assert.deepEqual(result.errors, ["json: expected a top-level object"]);
});

test("parseImportJsonDocument rejects unknown top-level fields", () => {
  const doc = JSON.parse(VALID_DOC);
  doc.extra = [];
  const result = parseImportJsonDocument(JSON.stringify(doc));
  assert.ok(result.errors.some((e) => e.includes("unknown top-level field(s): extra")));
});

test("parseImportJsonDocument rejects a missing dataset key", () => {
  const doc = JSON.parse(VALID_DOC);
  delete doc.quizTasks;
  const result = parseImportJsonDocument(JSON.stringify(doc));
  assert.ok(result.errors.some((e) => e.includes("missing top-level field(s): quizTasks")));
});

test("parseImportJsonDocument rejects a non-array dataset value", () => {
  const doc = JSON.parse(VALID_DOC);
  doc.themes = "not an array";
  const result = parseImportJsonDocument(JSON.stringify(doc));
  assert.ok(result.errors.some((e) => e.includes("themes: expected an array")));
});

test("parseImportJsonDocument rejects a non-object item inside a dataset array", () => {
  const doc = JSON.parse(VALID_DOC);
  doc.themes = [1, 2];
  const result = parseImportJsonDocument(JSON.stringify(doc));
  assert.ok(result.errors.some((e) => e.includes("themes[0]: expected an object")));
  assert.ok(result.errors.some((e) => e.includes("themes[1]: expected an object")));
});
