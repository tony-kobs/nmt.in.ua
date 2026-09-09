/**
 * Fetch open NMT math variants from zno.osvita.ua (official session / demo
 * materials mirrored for public practice) and write JSON for DB import.
 *
 * Usage:
 *   node scripts/fetch-nmt-variants.mjs
 *   node scripts/fetch-nmt-variants.mjs --import   # also write into MySQL
 *
 * Attribution stays in each variant's source_note / task source_url.
 * Images are downloaded under public/nmt/osvita/ so the trainer does not
 * hotlink a third-party CDN.
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_JSON = join(ROOT, "content/nmt-variants/variants.json");
const OUT_REVIEW = join(ROOT, "docs/content-review/nmt-variants-2026-09-09.md");
const IMG_DIR = join(ROOT, "public/nmt/osvita");
const BASE = "https://zno.osvita.ua";

/** Freshest open NMT math variants (2022–2026 demos + sessions). */
const VARIANT_IDS = [
  { id: 846, year: 2026, label: "НМТ 2026 · 1 сесія" },
  { id: 847, year: 2026, label: "НМТ 2026 · 2 сесія" },
  { id: 712, year: 2026, label: "НМТ 2026 · демоваріант" },
  { id: 671, year: 2025, label: "НМТ 2025 · 1 сесія" },
  { id: 672, year: 2025, label: "НМТ 2025 · 2 сесія" },
  { id: 585, year: 2024, label: "НМТ 2024 · 1 сесія" },
  { id: 606, year: 2024, label: "НМТ 2024 · 2 сесія" },
  { id: 570, year: 2024, label: "НМТ 2024 · демоваріант" },
  { id: 546, year: 2023, label: "НМТ 2023 · 1 сесія" },
  { id: 547, year: 2023, label: "НМТ 2023 · 2 сесія" },
  { id: 523, year: 2023, label: "НМТ 2023 · демоваріант" },
  { id: 521, year: 2022, label: "НМТ 2022 · основна сесія" },
  { id: 516, year: 2022, label: "НМТ 2022 · демоваріант" },
];

const LETTER_TO_N = { a: 1, b: 2, c: 3, d: 4, e: 5 };

function loadEnvLocal() {
  const path = join(ROOT, ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

function stripTags(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&ndash;/gi, "–")
    .replace(/&mdash;/gi, "—")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

function latexToKatex(html) {
  return html
    .replace(/<latex\b[^>]*>([\s\S]*?)<\/latex>/gi, (_, body) => {
      let inner = body.trim();
      inner = inner
        .replace(/^\$\$([\s\S]*)\$\$$/, "$1")
        .replace(/^\\\(([\s\S]*)\\\)$/, "$1")
        .replace(/^\\\[([\s\S]*)\\\]$/, "$1")
        .trim();
      if (/\\begin\{/.test(inner) || /\n/.test(inner)) {
        return `$$${inner}$$`;
      }
      return `$${inner}$`;
    })
    .replace(/<\/?span[^>]*>/gi, "");
}

async function downloadImage(src) {
  const url = src.startsWith("http") ? src : `${BASE}${src}`;
  const ext = (url.match(/\.(png|jpe?g|gif|webp|svg)(?:\?|$)/i) || [, "png"])[1];
  const hash = createHash("sha1").update(url).digest("hex").slice(0, 16);
  const file = `${hash}.${ext.toLowerCase()}`;
  const abs = join(IMG_DIR, file);
  mkdirSync(IMG_DIR, { recursive: true });
  if (!existsSync(abs)) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`image ${url}: ${res.status}`);
    writeFileSync(abs, Buffer.from(await res.arrayBuffer()));
  }
  return `/nmt/osvita/${file}`;
}

async function rewriteImages(html) {
  const matches = [...html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"[^>]*>/gi)];
  let out = html;
  for (const m of matches) {
    const local = await downloadImage(m[1]);
    out = out.replace(m[0], `<img src="${local}" alt="" />`);
  }
  return out;
}

function htmlToTaskText(html) {
  let t = latexToKatex(html);
  t = t.replace(/<br\s*\/?>/gi, "\n");
  t = t.replace(/<\/p>/gi, "\n");
  t = t.replace(/<p[^>]*>/gi, "");
  t = t.replace(/<img\b[^>]*\bsrc="([^"]+)"[^>]*>/gi, "![]($1)");
  t = stripTags(t);
  return t.replace(/\n{3,}/g, "\n\n").trim();
}

function parseAnswersBlock(blockHtml) {
  const answers = [];
  const re =
    /<div class="answer"><span class="marker">([А-ДA-Ea-e])<\/span>([\s\S]*?)<\/div>/gi;
  let m;
  while ((m = re.exec(blockHtml))) {
    answers.push(htmlToTaskText(m[2]));
  }
  return answers;
}

function tipToKind(tip) {
  if (tip === 1) return "mcq";
  if (tip === 13) return "match";
  if (tip === 8) return "open";
  return null;
}

async function parseVariant(meta) {
  const url = `${BASE}/mathematics/${meta.id}/`;
  const res = await fetch(url, {
    headers: { "User-Agent": "nmt.in.ua-importer/1.0 (educational)" },
  });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  let html = await res.text();
  html = await rewriteImages(html);

  const cards = [
    ...html.matchAll(
      /<div class="task-card"[^>]*id="q(\d+)"[\s\S]*?<form class="q-test"[\s\S]*?<\/form>[\s\S]*?(?=<a name="q\d+"|<\/div>\s*<script|$)/gi,
    ),
  ];

  // Fallback: split by task-card anchors
  const chunks = html.split(/<a name="q\d+"><\/a>/).slice(1);
  const tasks = [];

  for (const chunk of chunks) {
    const tipM = /name="q\[tip\]" value="(\d+)"/.exec(chunk);
    const orderM = /name="q\[out_order\]" value="(\d+)"/.exec(chunk);
    const idM = /name="q\[id\]" value="(\d+)"/.exec(chunk);
    const resultM = /name="result" value="([^"]+)"/.exec(chunk);
    if (!tipM || !orderM || !resultM) continue;

    const tip = Number(tipM[1]);
    const kind = tipToKind(tip);
    if (!kind) continue;

    const qHtml = /<div class="question">([\s\S]*?)<\/div>\s*<div class="clear">/.exec(
      chunk,
    );
    const taskText = qHtml ? htmlToTaskText(qHtml[1]) : "";
    if (!taskText) continue;

    const answersHtml = /<div class="answers">([\s\S]*?)<\/div>\s*<div class="clear/.exec(
      chunk,
    );
    const answers = answersHtml ? parseAnswersBlock(answersHtml[1]) : [];

    const commentM =
      /<div id="commentar_\d+"[^>]*>([\s\S]*?)<\/div>\s*<div class="description">/.exec(
        chunk,
      );
    let comments = commentM ? htmlToTaskText(commentM[1]) : "";
    comments = comments.replace(/^Пояснення\s*/i, "").trim();

    const result = resultM[1].trim().toLowerCase();
    const ord = Number(orderM[1]);
    const sourceId = idM?.[1] ?? String(ord);

    /** @type {Record<string, unknown>} */
    const task = {
      ord,
      name: `${meta.label} · №${ord}`,
      task_text: taskText,
      task_kind: kind,
      comments: comments || "—",
      difficulty: ord <= 10 ? 1 : ord <= 15 ? 2 : 3,
      source_url: `${url}#q${ord}`,
      osvita_qid: sourceId,
      answer_1: null,
      answer_2: null,
      answer_3: null,
      answer_4: null,
      answer_5: null,
      right_answer_n: null,
      right_answer_text: null,
    };

    if (kind === "mcq") {
      for (let i = 0; i < 5; i += 1) {
        task[`answer_${i + 1}`] = answers[i] ?? "";
      }
      task.right_answer_n = LETTER_TO_N[result] ?? null;
      if (!task.right_answer_n) continue;
    } else if (kind === "match") {
      // Keep column labels А–Д as answers for the matching UI.
      for (let i = 0; i < 5; i += 1) {
        task[`answer_${i + 1}`] = answers[i] ?? ["А", "Б", "В", "Г", "Д"][i];
      }
      task.right_answer_text = result;
    } else {
      task.right_answer_text = result;
    }

    tasks.push(task);
  }

  tasks.sort((a, b) => a.ord - b.ord);

  return {
    year: meta.year,
    label: meta.label,
    source_note: `Відкритий тест ЗНО-ОНЛАЙН / матеріали УЦОЯО: ${url}`,
    source_url: url,
    osvita_test_id: meta.id,
    tasks_number: tasks.length,
    tasks,
  };
}

async function importToDb(variants) {
  loadEnvLocal();
  const mysql = (await import("mysql2/promise")).default;
  const c = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: +(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    multipleStatements: true,
  });

  await c.query("DELETE FROM nmt_variant_tasks");
  await c.query("DELETE FROM nmt_variants");
  await c.query("DELETE FROM nmt_quiz_tasks");

  for (const v of variants) {
    const [ins] = await c.execute(
      `INSERT INTO nmt_variants (year, label, source_note, tasks_number, is_published)
       VALUES (?, ?, ?, ?, 1)`,
      [v.year, v.label, v.source_note, v.tasks.length],
    );
    const variantId = ins.insertId;

    for (const t of v.tasks) {
      const [taskIns] = await c.execute(
        `INSERT INTO nmt_quiz_tasks
          (name, task_text, answer_1, answer_2, answer_3, answer_4, answer_5,
           right_answer_n, right_answer_text, task_kind, comments, difficulty, source_url)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          t.name,
          t.task_text,
          t.answer_1,
          t.answer_2,
          t.answer_3,
          t.answer_4,
          t.answer_5,
          t.right_answer_n,
          t.right_answer_text,
          t.task_kind,
          t.comments,
          t.difficulty,
          t.source_url,
        ],
      );
      await c.execute(
        `INSERT INTO nmt_variant_tasks (variant_id, task_id, ord) VALUES (?, ?, ?)`,
        [variantId, taskIns.insertId, t.ord],
      );
    }
    console.log(`DB ← ${v.label}: ${v.tasks.length} tasks`);
  }

  await c.end();
}

function writeReview(variants) {
  const lines = [
    "# NMT variants — content review",
    "",
    `Дата: 2026-09-09. Джерело: відкриті тести [ЗНО-ОНЛАЙН](https://zno.osvita.ua/mathematics/) (сесії / демоваріанти УЦОЯО).`,
    "",
    "Окремий банк `nmt_quiz_tasks` — **не** змішується з `quiz_tasks`.",
    "",
  ];
  for (const v of variants) {
    lines.push(`## ${v.label}`);
    lines.push("");
    lines.push(`- URL: ${v.source_url}`);
    lines.push(`- Завдань: ${v.tasks.length}`);
    lines.push(
      `- Види: ${["mcq", "match", "open"].map((k) => `${k}=${v.tasks.filter((t) => t.task_kind === k).length}`).join(", ")}`,
    );
    lines.push("");
  }
  mkdirSync(dirname(OUT_REVIEW), { recursive: true });
  writeFileSync(OUT_REVIEW, lines.join("\n"), "utf8");
}

const doImport = process.argv.includes("--import");
mkdirSync(IMG_DIR, { recursive: true });
mkdirSync(dirname(OUT_JSON), { recursive: true });

const variants = [];
for (const meta of VARIANT_IDS) {
  process.stdout.write(`fetch ${meta.id} ${meta.label}… `);
  const v = await parseVariant(meta);
  console.log(`${v.tasks.length} tasks`);
  if (v.tasks.length < 15) {
    console.warn(`  warn: expected ~22, got ${v.tasks.length}`);
  }
  variants.push(v);
}

writeFileSync(OUT_JSON, JSON.stringify(variants, null, 2), "utf8");
writeReview(variants);
console.log(`wrote ${OUT_JSON}`);

if (doImport) {
  await importToDb(variants);
  console.log("import done");
}
