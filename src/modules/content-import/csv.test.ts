import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCsvDataset, parseCsvTable } from "./csv";

test("parseCsvTable splits simple comma-separated rows", () => {
  const table = parseCsvTable("id,name\n1,Alpha\n2,Beta\n");
  assert.deepEqual(table, [
    ["id", "name"],
    ["1", "Alpha"],
    ["2", "Beta"],
  ]);
});

test("parseCsvTable handles quoted fields with embedded commas, quotes, and newlines", () => {
  const table = parseCsvTable('id,text\n1,"a, b, ""c""\nnext line"\n');
  assert.deepEqual(table, [
    ["id", "text"],
    ["1", 'a, b, "c"\nnext line'],
  ]);
});

test("parseCsvTable accepts CRLF line endings", () => {
  const table = parseCsvTable("id,name\r\n1,Alpha\r\n");
  assert.deepEqual(table, [
    ["id", "name"],
    ["1", "Alpha"],
  ]);
});

test("parseCsvTable throws on an unterminated quoted field", () => {
  assert.throws(() => parseCsvTable('id,text\n1,"unterminated'));
});

test("parseCsvDataset rejects an empty file", () => {
  const result = parseCsvDataset("", ["id", "name"], "themes");
  assert.equal(result.rows.length, 0);
  assert.deepEqual(result.errors, ["themes: empty file"]);
});

test("parseCsvDataset rejects a mismatched header", () => {
  const result = parseCsvDataset("id,title\n1,x\n", ["id", "name"], "themes");
  assert.equal(result.rows.length, 0);
  assert.match(result.errors[0], /expected header \[id, name\], got \[id, title\]/);
});

test("parseCsvDataset flags a row with the wrong number of columns and keeps the rest", () => {
  const result = parseCsvDataset(
    "id,name\n1,Alpha\n2\n3,Gamma\n",
    ["id", "name"],
    "themes",
  );
  assert.equal(result.rows.length, 2);
  assert.match(result.errors[0], /themes row 3: expected 2 columns, got 1/);
});

test("parseCsvDataset produces raw rows keyed by column name with 1-based CSV row labels", () => {
  const result = parseCsvDataset("id,name\n1,Alpha\n", ["id", "name"], "themes");
  assert.deepEqual(result.rows, [
    { rowLabel: "themes row 2", raw: { id: "1", name: "Alpha" } },
  ]);
});

test("parseCsvDataset accepts an alternative header", () => {
  const result = parseCsvDataset(
    "id,name\n1,Alpha\n",
    ["id", "name", "code"],
    "themes",
    [["id", "name"]],
  );

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.rows, [
    { rowLabel: "themes row 2", raw: { id: "1", name: "Alpha" } },
  ]);
});
