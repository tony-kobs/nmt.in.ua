/**
 * Fill 1–3 / А–Д columns on the 41 official NMT matching tasks.
 *
 * Default is dry-run: print the diff, write nothing.
 * `--apply` updates `nmt_quiz_tasks` inside one transaction and writes a
 * rollback SQL file first. `right_answer_text` is never changed.
 *
 * Credentials come from the environment, then from `.env.local` only.
 * `.env.production` is not read, so a laptop that has the hosting env
 * file does not point this script at production by accident.
 *
 *   DB_HOST=127.0.0.1 DB_USER=... DB_PASSWORD=... DB_NAME=nmt_copy \
 *     node scripts/backfill-nmt-match.mjs
 *   node scripts/backfill-nmt-match.mjs --apply
 *
 * See the pull request for the backup step. Do not run `--apply` on
 * production until the same diff has been applied on a copy.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  formatNmtMatchBackfillReport,
  loadNmtMatchCatalog,
  planNmtMatchBackfill,
} from "./lib/nmt-match-backfill.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function loadEnvLocal() {
  const path = join(ROOT, ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(trimmed);
    if (!match || process.env[match[1]]) continue;
    let value = match[2];
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
}

function parseArgs(argv) {
  const apply = argv.includes("--apply");
  const dryRun = argv.includes("--dry-run") || !apply;
  if (apply && argv.includes("--dry-run")) {
    throw new Error("Передайте або --dry-run, або --apply.");
  }
  const unknown = argv.filter((arg) => arg !== "--apply" && arg !== "--dry-run");
  if (unknown.length > 0) {
    throw new Error(`Невідомий аргумент: ${unknown.join(", ")}`);
  }
  return { apply, dryRun };
}

function requireDb() {
  const host = process.env.DB_HOST;
  const user = process.env.DB_USER;
  const database = process.env.DB_NAME;
  if (!host || !user || !database) {
    throw new Error(
      "Потрібні DB_HOST, DB_USER і DB_NAME (пароль — DB_PASSWORD). .env.production скрипт не читає.",
    );
  }
  return {
    host,
    port: Number(process.env.DB_PORT || 3306),
    user,
    password: process.env.DB_PASSWORD ?? "",
    database,
  };
}

function sqlLiteral(value) {
  if (value == null) return "NULL";
  return `'${String(value).replaceAll("\\", "\\\\").replaceAll("'", "''")}'`;
}

function rollbackSql(updates) {
  const statements = updates.map((row) => {
    const answers = row.previousAnswers
      .map((text, index) => `answer_${index + 1} = ${sqlLiteral(text)}`)
      .join(", ");
    return [
      "UPDATE nmt_quiz_tasks",
      `SET task_text = ${sqlLiteral(row.previousText)}, ${answers}`,
      `WHERE id = ${Number(row.id)} AND task_kind = 'match';`,
    ].join("\n");
  });
  return [
    "-- Rollback for scripts/backfill-nmt-match.mjs",
    "-- Restores task_text and answer_1..5 only. The scoring key is untouched.",
    "START TRANSACTION;",
    ...statements,
    "COMMIT;",
    "",
  ].join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  loadEnvLocal();
  const db = requireDb();
  const mysql = (await import("mysql2/promise")).default;
  const connection = await mysql.createConnection({
    host: db.host,
    port: db.port,
    user: db.user,
    password: db.password,
    database: db.database,
    charset: "utf8mb4",
  });

  try {
    const [rows] = await connection.query(
      `SELECT id, name, task_kind, task_text,
              answer_1, answer_2, answer_3, answer_4, answer_5, right_answer_text
       FROM nmt_quiz_tasks
       WHERE task_kind = 'match'`,
    );
    const catalog = loadNmtMatchCatalog();
    const plan = planNmtMatchBackfill(rows, catalog);
    const database = `${db.host}:${db.port}/${db.database}`;
    const mode = args.apply ? "apply" : "dry-run";
    console.log(formatNmtMatchBackfillReport(plan, { mode, database }));

    if (!args.apply) return;

    if (plan.updates.length === 0) {
      console.log("apply: змінювати нічого.");
      return;
    }

    const dir = join(ROOT, "backups");
    mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replaceAll(":", "-");
    const rollbackPath = join(dir, `nmt-match-rollback-${stamp}.sql`);
    writeFileSync(rollbackPath, rollbackSql(plan.updates), "utf8");
    console.log(`rollback file: ${rollbackPath}`);

    await connection.beginTransaction();
    try {
      for (const row of plan.updates) {
        const [result] = await connection.execute(
          `UPDATE nmt_quiz_tasks
           SET task_text = ?, answer_1 = ?, answer_2 = ?, answer_3 = ?, answer_4 = ?, answer_5 = ?
           WHERE id = ? AND task_kind = 'match'
             AND task_text = ?
             AND answer_1 <=> ?
             AND answer_2 <=> ?
             AND answer_3 <=> ?
             AND answer_4 <=> ?
             AND answer_5 <=> ?`,
          [
            row.nextText,
            ...row.nextAnswers,
            row.id,
            row.previousText,
            ...row.previousAnswers,
          ],
        );
        if (result.affectedRows !== 1) {
          throw new Error(
            `Рядок id=${row.id} змінився між читанням і записом. Транзакцію скасовано.`,
          );
        }
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    }
    console.log(`apply: оновлено ${plan.updates.length}.`);
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
