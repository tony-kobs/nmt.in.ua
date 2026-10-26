/**
 * Rebuild `src/modules/testing/nmtMatchCatalog.json` from the public
 * zno.osvita.ua variants. Does not touch MySQL.
 *
 *   node scripts/build-nmt-match-catalog.mjs
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  htmlToTaskText,
  parseMatchColumns,
  tipToKind,
} from "./lib/nmt-osvita-html.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "src/modules/testing/nmtMatchCatalog.json");
const IMG_DIR = join(ROOT, "public/nmt/osvita");
const BASE = "https://zno.osvita.ua";

const VARIANT_IDS = [
  { id: 846, label: "НМТ 2026 · 1 сесія" },
  { id: 847, label: "НМТ 2026 · 2 сесія" },
  { id: 712, label: "НМТ 2026 · демоваріант" },
  { id: 671, label: "НМТ 2025 · 1 сесія" },
  { id: 672, label: "НМТ 2025 · 2 сесія" },
  { id: 585, label: "НМТ 2024 · 1 сесія" },
  { id: 606, label: "НМТ 2024 · 2 сесія" },
  { id: 570, label: "НМТ 2024 · демоваріант" },
  { id: 546, label: "НМТ 2023 · 1 сесія" },
  { id: 547, label: "НМТ 2023 · 2 сесія" },
  { id: 523, label: "НМТ 2023 · демоваріант" },
  { id: 521, label: "НМТ 2022 · основна сесія" },
  { id: 516, label: "НМТ 2022 · демоваріант" },
];

function localImagePath(src) {
  const url = src.startsWith("http") ? src : `${BASE}${src}`;
  const ext = (url.match(/\.(png|jpe?g|gif|webp|svg)(?:\?|$)/i) || [, "png"])[1];
  const hash = createHash("sha1").update(url).digest("hex").slice(0, 16);
  return `/nmt/osvita/${hash}.${ext.toLowerCase()}`;
}

async function ensureImage(src) {
  const url = src.startsWith("http") ? src : `${BASE}${src}`;
  const rel = localImagePath(src);
  const abs = join(ROOT, "public", rel.replace(/^\//, ""));
  if (!existsSync(abs)) {
    mkdirSync(IMG_DIR, { recursive: true });
    const res = await fetch(url);
    if (!res.ok) throw new Error(`image ${url}: ${res.status}`);
    writeFileSync(abs, Buffer.from(await res.arrayBuffer()));
    console.log(`  image ${rel}`);
  }
  return rel;
}

async function rewriteImages(text) {
  const refs = [...text.matchAll(/!\[\]\(([^)]+)\)/g)];
  let out = text;
  for (const ref of refs) {
    const src = ref[1];
    if (src.startsWith("/nmt/osvita/")) continue;
    const local = await ensureImage(src);
    out = out.replace(ref[0], `![](${local})`);
  }
  return out;
}

const catalog = {};
let maxMcq = 0;
let maxMatch = 0;
let mcqOver = 0;

for (const meta of VARIANT_IDS) {
  process.stdout.write(`fetch ${meta.id} ${meta.label}… `);
  const res = await fetch(`${BASE}/mathematics/${meta.id}/`, {
    headers: { "User-Agent": "nmt.in.ua-importer/1.0 (educational)" },
  });
  if (!res.ok) throw new Error(`${meta.id} → ${res.status}`);
  const html = await res.text();
  const chunks = html.split(/<a name="q\d+"><\/a>/).slice(1);
  let matches = 0;

  for (const chunk of chunks) {
    const tipM = /name="q\[tip\]" value="(\d+)"/.exec(chunk);
    const orderM = /name="q\[out_order\]" value="(\d+)"/.exec(chunk);
    if (!tipM || !orderM) continue;
    const kind = tipToKind(Number(tipM[1]));
    const ord = Number(orderM[1]);

    if (kind === "mcq") {
      const answersHtml = /<div class="answers">([\s\S]*?)<\/div>\s*<div class="clear/.exec(
        chunk,
      );
      if (!answersHtml) continue;
      const texts = [
        ...answersHtml[1].matchAll(
          /<div class="answer"><span class="marker">[^<]*<\/span>([\s\S]*?)<\/div>/gi,
        ),
      ].map((m) => htmlToTaskText(m[1]));
      for (const text of texts) {
        maxMcq = Math.max(maxMcq, text.length);
        if (text.length > 255) mcqOver += 1;
      }
    }

    if (kind !== "match") continue;
    const parsed = parseMatchColumns(chunk);
    if (!parsed || parsed.left.length !== 3 || parsed.right.some((text) => !text.trim())) {
      throw new Error(`${meta.label} №${ord}: incomplete match columns`);
    }
    const entry = {
      leftTitle: await rewriteImages(parsed.leftTitle),
      rightTitle: await rewriteImages(parsed.rightTitle),
      left: await Promise.all(parsed.left.map((text) => rewriteImages(text))),
      right: await Promise.all(parsed.right.map((text) => rewriteImages(text))),
    };
    for (const text of [...entry.left, ...entry.right]) {
      maxMatch = Math.max(maxMatch, text.length);
    }
    catalog[`${meta.label} · №${ord}`] = entry;
    matches += 1;
  }

  console.log(`${matches} match`);
  if (matches < 1) throw new Error(`${meta.label}: no matching tasks`);
}

writeFileSync(OUT, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
console.log(`wrote ${Object.keys(catalog).length} tasks → ${OUT}`);
console.log(`max match item ${maxMatch} chars; max mcq option ${maxMcq}; mcq over 255: ${mcqOver}`);
