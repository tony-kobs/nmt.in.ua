/**
 * Copy src/content/workbookProblems.json into `problems` and mark
 * `workbook_catalog`. Idempotent. Not part of deploy.
 *
 * Dry-run is the default and does not write. `--apply` writes, and only
 * after you have a backup. Already-set DB_* win. Otherwise the script reads
 * `.env.production`, then `.env.local`, and does not replace a value that
 * is already set. It does not print the password or the task text.
 *
 *   node scripts/import-workbook.mjs
 *   node scripts/import-workbook.mjs --apply
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import {
  SQL_UPSERT_WORKBOOK_MARKER,
  chunkProblems,
  countWorkbookChanges,
  parseImportArgs,
  planWorkbookImport,
  problemUpsertParams,
  problemUpsertSql,
  workbookCatalogExpected,
} from "./lib/workbook-catalog.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalogPath = path.join(root, "src", "content", "workbookProblems.json");

function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Немає ${name}. Задай змінну або поклади її в .env.local.`);
  }
  return value;
}

function isMissingTable(error) {
  return error && (error.errno === 1146 || error.code === "ER_NO_SUCH_TABLE");
}

async function main() {
  const parsed = parseImportArgs(process.argv.slice(2));
  if (parsed.help) {
    console.log(`Використання: node scripts/import-workbook.mjs [--apply]

Без --apply нічого не записує. --apply копіює задачник у problems.
Перед --apply на проді зроби бекап бази. Скрипт не входить у деплой.`);
    return;
  }
  if (parsed.error) {
    console.error(`Невідомий аргумент: ${parsed.error}`);
    process.exitCode = 1;
    return;
  }

  const catalog = JSON.parse(fs.readFileSync(catalogPath, "utf8"));
  const problems = catalog.problems;
  if (!Array.isArray(problems) || problems.length === 0) {
    throw new Error("workbookProblems.json: порожній каталог");
  }
  const expected = workbookCatalogExpected(problems);

  loadEnvFile(path.join(root, ".env.production"));
  loadEnvFile(path.join(root, ".env.local"));

  const conn = await mysql.createConnection({
    host: required("DB_HOST"),
    port: Number(process.env.DB_PORT ?? 3306),
    user: required("DB_USER"),
    password: required("DB_PASSWORD"),
    database: required("DB_NAME"),
    connectTimeout: 20_000,
    multipleStatements: false,
    charset: "utf8mb4",
  });

  try {
    let existing = [];
    try {
      const [rows] = await conn.query(
        `SELECT id, name, problem_text, theme_id, answer_1, answer_2, answer_3, answer_4,
                right_answer_n, comments, difficulty
         FROM problems
         WHERE id IN (${expected.ids.map(() => "?").join(", ")})`,
        expected.ids,
      );
      existing = rows;
    } catch (error) {
      if (isMissingTable(error)) {
        console.error("Немає таблиці problems. Спочатку npm run migrate. Сторінка лишається на JSON.");
        process.exitCode = 1;
        return;
      }
      throw error;
    }

    let marker = null;
    try {
      const [rows] = await conn.query(
        "SELECT revision, problem_count FROM workbook_catalog WHERE id = 1",
      );
      marker = rows[0] ?? null;
    } catch (error) {
      if (isMissingTable(error)) {
        console.error(
          "Немає таблиці workbook_catalog. Спочатку npm run migrate (файл 067). Сторінка лишається на JSON.",
        );
        process.exitCode = 1;
        return;
      }
      throw error;
    }

    const plan = planWorkbookImport(
      existing.map((row) => row.id),
      expected.ids,
    );
    const changes = countWorkbookChanges(existing, problems);
    const markerReady = marker?.revision === expected.revision && Number(marker?.problem_count) === expected.count;
    console.log(
      `Каталог ${expected.count}, ревізія ${expected.revision.slice(0, 12)}…. ` +
        `У базі з цих id: нових ${plan.insert}, вже є ${plan.update}. ` +
        `Збігаються ${changes.same}, відрізняються ${changes.different}, немає ${changes.missing}. ` +
        `Маркер ${markerReady ? "цей каталог" : "ще не цей каталог"}.`,
    );
    if (changes.sampleIds.length > 0) {
      console.log(`Приклади id: ${changes.sampleIds.join(", ")}`);
    }

    if (!parsed.apply) {
      console.log("Сухий прогін, запис не робив. Після бекапу: node scripts/import-workbook.mjs --apply");
      return;
    }

    await conn.beginTransaction();
    try {
      for (const chunk of chunkProblems(problems)) {
        await conn.execute(problemUpsertSql(chunk.length), problemUpsertParams(chunk));
      }
      await conn.execute(SQL_UPSERT_WORKBOOK_MARKER, [expected.revision, expected.count]);
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    }
    console.log(`Записано задачник: нових ${plan.insert}, оновлених ${plan.update}. Повтор теж безпечний.`);
  } finally {
    await conn.end();
  }
}

const invoked = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (invoked) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : "import failed";
    console.error(message);
    process.exitCode = 1;
  });
}
