import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import { embedNmtMatch } from "./nmt-osvita-html.mjs";
import {
  formatNmtMatchBackfillReport,
  isPlaceholderMatchAnswer,
  loadNmtMatchCatalog,
  planNmtMatchBackfill,
} from "./nmt-match-backfill.mjs";

const NAME = "НМТ 2026 · 1 сесія · №16";

function entry() {
  return loadNmtMatchCatalog()[NAME];
}

function placeholderRow(overrides = {}) {
  return {
    id: 7,
    name: NAME,
    task_kind: "match",
    task_text: "Узгодьте функцію (1–3) з її властивістю (А–Д).",
    answer_1: "А",
    answer_2: "Б",
    answer_3: "В",
    answer_4: "Г",
    answer_5: "Д",
    right_answer_text: "1b;2d;3a",
    ...overrides,
  };
}

test("placeholder letters are the only answers the backfill replaces", () => {
  assert.equal(isPlaceholderMatchAnswer("А"), true);
  assert.equal(isPlaceholderMatchAnswer("E"), true);
  assert.equal(isPlaceholderMatchAnswer(null), true);
  assert.equal(isPlaceholderMatchAnswer("$y=x^2$"), false);
});

test("placeholder matching row gains the embed and the А–Д texts", () => {
  const plan = planNmtMatchBackfill([placeholderRow()], { [NAME]: entry() });
  assert.equal(plan.updates.length, 1);
  const update = plan.updates[0];
  assert.equal(update.textChanges, true);
  assert.match(update.nextText, /\[\[nmt-match\]\]/);
  assert.match(update.nextText, /Узгодьте функцію/);
  assert.deepEqual(update.nextAnswers, entry().right);
  assert.equal("right_answer_text" in update, false);

  const filled = placeholderRow({
    task_text: update.nextText,
    answer_1: update.nextAnswers[0],
    answer_2: update.nextAnswers[1],
    answer_3: update.nextAnswers[2],
    answer_4: update.nextAnswers[3],
    answer_5: update.nextAnswers[4],
  });
  const again = planNmtMatchBackfill([filled], { [NAME]: entry() });
  assert.equal(again.updates.length, 0);
  assert.equal(again.unchanged.length, 1);
});

test("a hand-edited answer or embed is not overwritten", () => {
  const catalog = { [NAME]: entry() };
  const edited = placeholderRow({
    answer_1: "власний текст, не літера",
    answer_2: entry().right[1],
    answer_3: entry().right[2],
    answer_4: entry().right[3],
    answer_5: entry().right[4],
  });
  const keptAnswers = planNmtMatchBackfill([edited], catalog);
  assert.equal(keptAnswers.kept[0].reason, "answers-differ");

  const custom = embedNmtMatch("Інша умова.", {
    leftTitle: "Інше",
    rightTitle: "Інше",
    left: ["1", "2", "3"],
    right: ["a", "b", "c", "d", "e"],
  });
  const keptEmbed = planNmtMatchBackfill(
    [placeholderRow({ task_text: custom })],
    catalog,
  );
  assert.equal(keptEmbed.kept[0].reason, "embed-differs");
});

test("rows outside the catalog and missing names are reported, not updated", () => {
  const plan = planNmtMatchBackfill(
    [
      placeholderRow({ id: 1, name: "Чернетка · №1" }),
      { ...placeholderRow({ id: 2, name: "MCQ control" }), task_kind: "mcq" },
    ],
    { "Немає в базі": entry() },
  );
  assert.equal(plan.updates.length, 0);
  assert.deepEqual(
    plan.outside.map((row) => row.name),
    ["Чернетка · №1"],
  );
  assert.deepEqual(plan.missing, ["Немає в базі"]);
});

test("dry-run report names the database and hides the scoring key", () => {
  const plan = planNmtMatchBackfill([placeholderRow()], { [NAME]: entry() });
  const report = formatNmtMatchBackfillReport(plan, {
    mode: "dry-run",
    database: "127.0.0.1:3306/nmt_copy",
  });
  assert.match(report, /mode: dry-run/);
  assert.match(report, /nmt_copy/);
  assert.match(report, /базу не змінено/);
  assert.equal(report.includes("1b;2d;3a"), false);
});

const testDb = process.env.NMT_MATCH_TEST_DATABASE;

test(
  "backfill apply on a local MySQL copy is idempotent",
  { skip: testDb ? false : "NMT_MATCH_TEST_DATABASE is not set" },
  async () => {
    const mysql = (await import("mysql2/promise")).default;
    if (!testDb) return;
    const connection = await mysql.createConnection(testDb);
    const catalog = loadNmtMatchCatalog();
    const suffix = randomBytes(4).toString("hex");
    const table = `nmt_quiz_tasks_${suffix}`;
    try {
      await connection.query(`
        CREATE TABLE ${table} (
          id INT NOT NULL AUTO_INCREMENT,
          name VARCHAR(100) NOT NULL,
          task_text TEXT NOT NULL,
          answer_1 VARCHAR(255) NULL,
          answer_2 VARCHAR(255) NULL,
          answer_3 VARCHAR(255) NULL,
          answer_4 VARCHAR(255) NULL,
          answer_5 VARCHAR(255) NULL,
          right_answer_n TINYINT NULL,
          right_answer_text VARCHAR(64) NULL,
          task_kind ENUM('mcq', 'match', 'open') NOT NULL DEFAULT 'mcq',
          comments TEXT NOT NULL,
          difficulty TINYINT NOT NULL DEFAULT 1,
          source_url VARCHAR(255) NULL,
          PRIMARY KEY (id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);

      let id = 1;
      for (const name of Object.keys(catalog)) {
        await connection.execute(
          `INSERT INTO ${table}
            (id, name, task_text, answer_1, answer_2, answer_3, answer_4, answer_5,
             right_answer_text, task_kind, comments)
           VALUES (?, ?, ?, 'А', 'Б', 'В', 'Г', 'Д', '1a;2b;3c', 'match', '—')`,
          [id, name, `Умова ${name}`],
        );
        id += 1;
      }
      await connection.execute(
        `INSERT INTO ${table}
          (id, name, task_text, answer_1, right_answer_n, task_kind, comments)
         VALUES (?, 'MCQ control', 'Скільки буде 2+2?', '$4$', 2, 'mcq', '—')`,
        [id],
      );

      const [before] = await connection.query(
        `SELECT id, name, task_kind, task_text, answer_1, answer_2, answer_3, answer_4, answer_5, right_answer_text
         FROM ${table} WHERE task_kind = 'match'`,
      );
      const plan = planNmtMatchBackfill(before, catalog);
      assert.equal(plan.updates.length, Object.keys(catalog).length);
      assert.equal(plan.missing.length, 0);

      await connection.beginTransaction();
      for (const row of plan.updates) {
        await connection.execute(
          `UPDATE ${table}
           SET task_text = ?, answer_1 = ?, answer_2 = ?, answer_3 = ?, answer_4 = ?, answer_5 = ?
           WHERE id = ? AND task_kind = 'match'`,
          [row.nextText, ...row.nextAnswers, row.id],
        );
      }
      await connection.commit();

      const [after] = await connection.query(
        `SELECT id, name, task_kind, task_text, answer_1, answer_2, answer_3, answer_4, answer_5, right_answer_text
         FROM ${table}`,
      );
      const rows = after;
      const again = planNmtMatchBackfill(
        rows.filter((row) => row.task_kind === "match"),
        catalog,
      );
      assert.equal(again.updates.length, 0);
      assert.equal(again.unchanged.length, Object.keys(catalog).length);
      for (const row of rows) {
        if (row.task_kind === "match") {
          assert.match(row.task_text, /\[\[nmt-match\]\]/);
          assert.equal(row.right_answer_text, "1a;2b;3c");
          assert.notEqual(row.answer_1, "А");
        }
      }
      const mcq = rows.find((row) => row.name === "MCQ control");
      assert.equal(mcq?.answer_1, "$4$");
      assert.equal(mcq?.task_text, "Скільки буде 2+2?");
    } finally {
      await connection.query(`DROP TABLE IF EXISTS ${table}`);
      await connection.end();
    }
  },
);
