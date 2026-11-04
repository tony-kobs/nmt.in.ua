/**
 * Propose short card hints for quiz_tasks.hint_short.
 *
 * Dry-run (default) writes scripts/data/short-hints-review.json and does not
 * change the database. --apply writes hint_short and is never part of deploy.
 *
 * Connects only when .env.local exists. It does not read .env.production.
 *
 *   node scripts/short-hints.mjs
 *   node scripts/short-hints.mjs --apply
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import mysql from "mysql2/promise";
import { proposeShortHint } from "./lib/short-hint.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reviewPath = path.join(root, "scripts", "data", "short-hints-review.json");

const FIXTURES = [
  {
    id: null,
    source: "screenshot",
    topic: "Елементарна планіметрія",
    taskText:
      "У трикутнику одна сторона дорівнює 12 см, а середня лінія, паралельна другій стороні, – 5 см. Знайдіть периметр трикутника, якщо третя сторона дорівнює 13 см.",
    comments: "Тому P=12+10+13=35 см.",
    answers: ["30 см", "35 см", "40 см", "45 см"],
    rightAnswer: 2,
  },
  {
    id: null,
    source: "screenshot",
    topic: "Рівності та нерівності",
    taskText:
      "Знайдіть найбільше ціле число, що задовольняє подвійну нерівність −2 ≤ (2x−3)/5 < 3.",
    comments: "Маємо −10 ≤ 2x − 3 < 15, тому −7 ≤ 2x < 18. Найбільше ціле значення — 8.",
    answers: ["7", "8", "9", "10"],
    rightAnswer: 2,
  },
  {
    id: null,
    source: "seed-template",
    topic: "",
    taskText: "Обчисліть: 12 + 8",
    comments: "Правильна відповідь: 20",
    answers: ["18", "20", "22", "19"],
    rightAnswer: 2,
  },
  {
    id: null,
    source: "seed-template",
    topic: "",
    taskText: "Обчисліть: 45 − 17",
    comments: "Правильна відповідь: 28",
    answers: ["26", "28", "27", "29"],
    rightAnswer: 2,
  },
  {
    id: null,
    source: "seed-template",
    topic: "",
    taskText: "Обчисліть: 6 × 7",
    comments: "Правильна відповідь: 42",
    answers: ["42", "36", "48", "40"],
    rightAnswer: 1,
  },
  {
    id: null,
    source: "seed-template",
    topic: "",
    taskText: "Обчисліть: 56 ÷ 8",
    comments: "Правильна відповідь: 7",
    answers: ["6", "7", "8", "9"],
    rightAnswer: 2,
  },
  {
    id: null,
    source: "seed-template",
    topic: "",
    taskText: "Обчисліть: 3² + 4",
    comments: "Правильна відповідь: 13",
    answers: ["12", "13", "14", "16"],
    rightAnswer: 2,
  },
];

function loadLocalEnv() {
  const file = path.join(root, ".env.local");
  if (!fs.existsSync(file)) return false;
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
  return true;
}

function rowRecord(row, source) {
  const proposed = proposeShortHint(row);
  return {
    id: row.id ?? null,
    source,
    topic: row.topic ?? "",
    taskText: row.taskText ?? "",
    currentHint: row.comments ?? "",
    proposedShortHint: proposed,
  };
}

async function readQuizTasks() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectTimeout: 20_000,
  });
  try {
    const [rows] = await conn.query(
      `SELECT q.id, t.name AS topic, q.task_text AS taskText, q.comments,
              q.answer_1, q.answer_2, q.answer_3, q.answer_4, q.right_answer_n AS rightAnswer,
              q.hint_short AS hintShort
       FROM quiz_tasks q
       LEFT JOIN themes t ON t.id = q.theme_id
       ORDER BY q.id`,
    );
    return rows.map((row) => ({
      id: Number(row.id),
      topic: row.topic ?? "",
      taskText: row.taskText ?? "",
      comments: row.comments ?? "",
      answers: [row.answer_1, row.answer_2, row.answer_3, row.answer_4],
      rightAnswer: Number(row.rightAnswer),
      hintShort: row.hintShort ?? null,
    }));
  } finally {
    await conn.end();
  }
}

async function applyHints(records) {
  const writable = records.filter((row) => row.id && row.proposedShortHint);
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    connectTimeout: 20_000,
  });
  try {
    await conn.beginTransaction();
    for (const row of writable) {
      await conn.query("UPDATE quiz_tasks SET hint_short = ? WHERE id = ?", [
        row.proposedShortHint,
        row.id,
      ]);
    }
    await conn.commit();
    return writable.length;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    await conn.end();
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  const hasLocal = loadLocalEnv();
  let dbRows = [];
  let dbError = null;
  if (hasLocal && process.env.DB_HOST && process.env.DB_NAME) {
    try {
      dbRows = await readQuizTasks();
    } catch (error) {
      dbError = error instanceof Error ? error.message : "database unavailable";
    }
  }

  const records = [
    ...FIXTURES.map((row) => rowRecord(row, row.source)),
    ...dbRows.map((row) => rowRecord(row, "database")),
  ];
  const proposed = records.filter((row) => row.proposedShortHint).length;
  const coverage = hasLocal
    ? dbError
      ? `Локальна база не відкрилась (${dbError}). У файлі лише зразки з репозиторію: ${FIXTURES.length}.`
      : `Прочитано ${dbRows.length} рядків quiz_tasks з бази в .env.local. Запропоновано короткий текст для ${records.filter((row) => row.source === "database" && row.proposedShortHint).length} з них. Порожнє proposedShortHint означає: немає безпечної підказки без відповіді. Зразки зі скрінів і шаблонів додані окремо і в базу не пишуться.`
    : `Файла .env.local немає, базу не чіпав (і .env.production теж). Запропоновано тексти лише для ${FIXTURES.length} умов, які є в репозиторії: 2 зі скрінів кабінету і 5 шаблонів scripts/seed-theme-tasks.mjs. Решта банку quiz_tasks зʼявиться в цьому файлі після сухого прогону з локальною базою.`;

  const payload = {
    generatedAt: new Date().toISOString(),
    mode: apply ? "apply" : "dry-run",
    database: hasLocal && !dbError ? "env.local" : "none",
    coverage,
    proposed,
    rows: records,
  };
  fs.mkdirSync(path.dirname(reviewPath), { recursive: true });
  fs.writeFileSync(reviewPath, `${JSON.stringify(payload, null, 2)}\n`);
  console.log(coverage);
  console.log(reviewPath);

  if (!apply) return;
  if (!hasLocal || dbError || !process.env.DB_HOST) {
    console.error(" --apply потребує робочої бази з .env.local. Нічого не записано.");
    process.exitCode = 1;
    return;
  }
  const written = await applyHints(records.filter((row) => row.source === "database"));
  console.log(`Оновлено hint_short: ${written}`);
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
