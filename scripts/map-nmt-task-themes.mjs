/**
 * Map nmt_quiz_tasks.theme_id from УЦОЯО "ТЕМА: …" comments, or task text
 * when explanations are missing (e.g. НМТ 2026 · 2 сесія on osvita).
 *
 * Usage: node scripts/map-nmt-task-themes.mjs
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Ordered rules: first match wins. Against comments + task_text. */
const RULES = [
  { code: "MATH-09-STATISTICS", re: /статистик|д[іi]аграм/i },
  { code: "MATH-09-PROBABILITY", re: /ймов[іi]рн|імов[іi]рн/i },
  { code: "ALG-09-COMB-PROG", re: /комб[іi]натор|прогрес[іi]|посл[іi]довност/i },
  {
    code: "GEO-10-STEREOMETRY",
    re: /стереометр|конус|цил[іi]ндр|п[іi]рам[іi]д|паралелеп[іi]пед|т[іi]ла обертання|вектор.*простор|у простор[іi]/i,
  },
  { code: "ALG-11-INTEGRALS", re: /[іi]нтеграл|перв[іi]сн/i },
  {
    code: "ALG-11-DERIVATIVE",
    re: /пох[іi]дн|критичн(і|их) точк|точк(а|и) м[іi]н[іi]мум/i,
  },
  { code: "ALG-11-LIMITS", re: /границ/i },
  { code: "ALG-10-TRIG", re: /тригонометр|\\sin|\\cos|\\tan|\\mathrm\{tg\}|\\mathrm\{ctg\}/i },
  { code: "ALG-11-LOGARITHMS", re: /логарифм|\\log/i },
  {
    code: "ALG-09-FUNCTIONS",
    re: /функц|граф[іi]к|непарн(ої|а) функ|2\^\{|2\^x/i,
  },
  { code: "ALG-07-COORD-PLANE", re: /координатн(а|ій) площин/i },
  { code: "ALG-08-QUAD-EQ", re: /квадратн(і|их) р[іi]внян/i },
  { code: "ALG-08-POWERS-ROOTS", re: /ступен[яю]|корен|степен[яюі]/i },
  {
    code: "ALG-07-EXPRESSIONS",
    re: /дійсн(і|их) чис|вираз|числа [іi] вирази|тотожно/i,
  },
  { code: "GEO-07-PROOFS", re: /доказов|доведення|тверджен/i },
  { code: "ALG-09-EQ-INEQ", re: /нер[іi]вн|л[іi]н[іi]йн(і|их) нер/i },
  { code: "ALG-07-EQ", re: /р[іi]внян|єдин(ий|ого) кор[іi]нь|параметр/i },
  {
    code: "GEO-07-CALC",
    re: /обрахунков|планіметр.*величин|геометричн(і|их) величин|вимірювання|\\angle|кут/i,
  },
  { code: "ALG-08-FRACTIONS", re: /дроб|dfrac|\\\\dfrac/i },
  {
    code: "GEO-07-ELEM-PLAN",
    re: /планіметр|трикутник|чотирикутник|прямокутник|трапец|коло|круг|хорд/i,
  },
  {
    code: "MATH-07-WORD-PROBLEMS",
    re: /текстов|сюжетн|прикладн|планує|варт[іi]сть|хвилин|сплав|байдарк/i,
  },
  { code: "MATH-06-ARITH-OPS", re: /арифметич|в[іi]дношення|пропорц/i },
  { code: "MATH-05-ELEM-OPS", re: /елементарн/i },
];

function loadEnvLocal() {
  const path = join(ROOT, ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

function resolveThemeId(haystack, codeToId) {
  for (const rule of RULES) {
    if (rule.re.test(haystack)) {
      return codeToId.get(rule.code) ?? null;
    }
  }
  return null;
}

loadEnvLocal();
const mysql = (await import("mysql2/promise")).default;
const c = await mysql.createConnection({
  host: process.env.DB_HOST,
  port: +(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

const [themes] = await c.query("SELECT id, code FROM themes");
const codeToId = new Map(themes.map((t) => [t.code, t.id]));

const [tasks] = await c.query(
  "SELECT id, comments, task_text FROM nmt_quiz_tasks",
);
let mapped = 0;
let unmatched = 0;

for (const task of tasks) {
  const haystack = `${task.comments ?? ""}\n${task.task_text ?? ""}`;
  const themeId = resolveThemeId(haystack, codeToId);
  await c.execute("UPDATE nmt_quiz_tasks SET theme_id = ? WHERE id = ?", [
    themeId,
    task.id,
  ]);
  if (themeId) mapped += 1;
  else unmatched += 1;
}

const [byTheme] = await c.query(`
  SELECT t.code, t.name, COUNT(n.id) AS n
  FROM nmt_quiz_tasks n
  LEFT JOIN themes t ON t.id = n.theme_id
  GROUP BY t.code, t.name
  ORDER BY n DESC
`);
console.log(`mapped=${mapped} unmatched=${unmatched}`);
for (const row of byTheme) {
  console.log(`${row.n}\t${row.code ?? "NULL"}\t${row.name ?? "(none)"}`);
}

const [v2] = await c.query(`
  SELECT SUM(t.theme_id IS NULL) nulls, COUNT(*) n
  FROM nmt_variant_tasks vt
  JOIN nmt_quiz_tasks t ON t.id = vt.task_id
  WHERE vt.variant_id = 2
`);
console.log("variant2", v2[0]);
await c.end();
