import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { isIgnorableMigrationErrno, splitSqlStatements } from "../../../scripts/migrate-sql.mjs";

const sqlDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../scripts/sql");

test("splitSqlStatements drops comments and empty pieces", () => {
  const source = `
    -- header
    SELECT 1;
    /* block
       comment */
    ALTER TABLE app_users ADD COLUMN is_banned TINYINT(1) NOT NULL DEFAULT 0;
    ;
  `;
  assert.deepEqual(splitSqlStatements(source), [
    "SELECT 1",
    "ALTER TABLE app_users ADD COLUMN is_banned TINYINT(1) NOT NULL DEFAULT 0",
  ]);
});

test("semicolons inside quotes, escapes, comments, and DELIMITER stay intact", () => {
  assert.deepEqual(
    splitSqlStatements(
      "INSERT INTO t (note) VALUES ('Перенесення змінює знак; далі ділення'); SELECT 1;",
    ),
    ["INSERT INTO t (note) VALUES ('Перенесення змінює знак; далі ділення')", "SELECT 1"],
  );
  assert.deepEqual(splitSqlStatements(`SELECT "a;b", \`c;d\`;`), ['SELECT "a;b", `c;d`']);
  assert.deepEqual(splitSqlStatements("SELECT 'it\\';s'; SELECT 'it''s';"), [
    "SELECT 'it\\';s'",
    "SELECT 'it''s'",
  ]);
  assert.deepEqual(splitSqlStatements("SELECT 1; -- still; one\nSELECT 2; # also; one\nSELECT 3;"), [
    "SELECT 1",
    "SELECT 2",
    "SELECT 3",
  ]);
  assert.deepEqual(splitSqlStatements("SELECT 1; /* semi; colon */ SELECT 2;"), ["SELECT 1", "SELECT 2"]);
  assert.deepEqual(splitSqlStatements("SELECT 1--2;"), ["SELECT 1--2"]);
  assert.deepEqual(
    splitSqlStatements("DELIMITER $$\nBEGIN\n  SELECT 1;\n  SELECT 2;\nEND$$\nDELIMITER ;\nSELECT 3;"),
    ["BEGIN\n  SELECT 1;\n  SELECT 2;\nEND", "SELECT 3"],
  );
});

/** True when every quote closes and no `;` sits outside a string. Comments are already gone. */
function statementIsComplete(statement: string) {
  let i = 0;
  while (i < statement.length) {
    const ch = statement[i];
    if (ch === "'" || ch === '"' || ch === "`") {
      const quote = ch;
      i += 1;
      let closed = false;
      while (i < statement.length) {
        if (statement[i] === "\\") {
          i += 2;
          continue;
        }
        if (statement[i] === quote) {
          i += 1;
          if (statement[i] === quote) {
            i += 1;
            continue;
          }
          closed = true;
          break;
        }
        i += 1;
      }
      if (!closed) return false;
      continue;
    }
    if (ch === ";") return false;
    i += 1;
  }
  return true;
}

function naiveSplit(source: string) {
  return String(source)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

test("every migration file splits into complete statements", () => {
  const files = fs
    .readdirSync(sqlDir)
    .filter((name) => name.endsWith(".sql"))
    .sort((left, right) => left.localeCompare(right, "en"));
  const driftedBefore028 = [];

  for (const file of files) {
    const source = fs.readFileSync(path.join(sqlDir, file), "utf8");
    const statements = splitSqlStatements(source);
    assert.ok(statements.length > 0, file);
    for (const statement of statements) {
      assert.equal(statementIsComplete(statement), true, `${file}\n${statement.slice(0, 180)}`);
    }
    if (file < "028" && naiveSplit(source).length !== statements.length) {
      driftedBefore028.push(file);
    }
  }

  assert.deepEqual(driftedBefore028, []);

  const stage2 = fs.readFileSync(path.join(sqlDir, "028_stage2_task_formats.sql"), "utf8");
  const stage2Statements = splitSqlStatements(stage2);
  assert.equal(stage2Statements.length, 21);
  assert.equal(naiveSplit(stage2).length > stage2Statements.length, true);
  const orderInsert = stage2Statements.find((statement) =>
    statement.startsWith("INSERT IGNORE INTO order_tasks "),
  );
  assert.ok(orderInsert);
  assert.match(
    orderInsert,
    /Перенесення доданка в іншу частину рівняння змінює його знак на протилежний; після цього/,
  );
  assert.equal(
    stage2Statements.some((statement) => statement.endsWith("на протилежний")),
    false,
  );
});

test("duplicate schema errors are ignorable and a missing table is not", () => {
  for (const errno of [1022, 1050, 1060, 1061, 1062, 1091, 1826]) {
    assert.equal(isIgnorableMigrationErrno(errno), true);
  }
  assert.equal(isIgnorableMigrationErrno(1146), false);
  assert.equal(isIgnorableMigrationErrno("1060"), true);
});
