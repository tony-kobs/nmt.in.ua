/**
 * Plan an idempotent fill of NMT matching columns.
 *
 * Official rows imported before the `.answers.col` parser stored only the
 * letters А–Д in `answer_1..5` and the stem in `task_text`. The 1–3 prompts
 * and the real А–Д texts live in `nmtMatchCatalog.json`. This planner never
 * opens a connection and never changes `right_answer_text`.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  NMT_MATCH_CLOSE,
  NMT_MATCH_OPEN,
  embedNmtMatch,
} from "./nmt-osvita-html.mjs";

const CATALOG_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../src/modules/testing/nmtMatchCatalog.json",
);

const ANSWER_LIMIT = 255;

export function loadNmtMatchCatalog() {
  return JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
}

export function isPlaceholderMatchAnswer(text) {
  const value = String(text ?? "").trim();
  return value === "" || /^[АБВГДA-E]$/u.test(value);
}

function splitEmbed(taskText) {
  const text = String(taskText ?? "");
  const start = text.indexOf(NMT_MATCH_OPEN);
  const end = text.indexOf(NMT_MATCH_CLOSE);
  if (start === -1 && end === -1) {
    return { stem: text, embed: null, broken: false };
  }
  if (start === -1 || end < start) {
    return { stem: text, embed: null, broken: true };
  }
  const json = text.slice(start + NMT_MATCH_OPEN.length, end).trim();
  try {
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { stem: text, embed: null, broken: true };
    }
    const stem = `${text.slice(0, start)}${text.slice(end + NMT_MATCH_CLOSE.length)}`.trim();
    return { stem, embed: parsed, broken: false };
  } catch {
    return { stem: text, embed: null, broken: true };
  }
}

function payloadOf(entry) {
  return {
    leftTitle: entry.leftTitle ?? "",
    rightTitle: entry.rightTitle ?? "",
    left: entry.left ?? [],
    right: entry.right ?? [],
  };
}

function samePayload(embed, entry) {
  const want = payloadOf(entry);
  return (
    (embed.leftTitle ?? "") === want.leftTitle &&
    (embed.rightTitle ?? "") === want.rightTitle &&
    JSON.stringify(embed.left ?? []) === JSON.stringify(want.left) &&
    JSON.stringify(embed.right ?? []) === JSON.stringify(want.right)
  );
}

function rowAnswers(row) {
  return [1, 2, 3, 4, 5].map((index) => {
    const value = row[`answer_${index}`];
    return value == null ? null : String(value);
  });
}

/**
 * @param {Array<Record<string, unknown>>} rows match rows from `nmt_quiz_tasks`
 * @param {Record<string, {leftTitle: string, rightTitle: string, left: string[], right: string[]}>} catalog
 */
export function planNmtMatchBackfill(rows, catalog) {
  const updates = [];
  const unchanged = [];
  const kept = [];
  const missing = [];
  const seenNames = new Set();

  for (const [name, entry] of Object.entries(catalog)) {
    const matches = rows.filter(
      (row) => row.task_kind === "match" && String(row.name) === name,
    );
    if (matches.length === 0) {
      missing.push(name);
      continue;
    }
    for (const row of matches) {
      seenNames.add(name);
      const decision = decideRow(row, entry);
      if (decision.kind === "update") updates.push(decision);
      else if (decision.kind === "unchanged") unchanged.push(decision);
      else kept.push(decision);
    }
  }

  const outside = rows
    .filter(
      (row) => row.task_kind === "match" && !Object.hasOwn(catalog, String(row.name)),
    )
    .map((row) => ({
      id: row.id,
      name: String(row.name),
      reason: "not-in-catalog",
    }));

  return { updates, unchanged, kept, missing, outside, seenNames: [...seenNames] };
}

function decideRow(row, entry) {
  const base = { id: row.id, name: String(row.name) };
  const right = entry.right ?? [];
  const left = entry.left ?? [];
  if (left.length !== 3 || right.length !== 5 || right.some((text) => !String(text).trim())) {
    return { ...base, kind: "kept", reason: "catalog-shape" };
  }
  const tooLong = right.find((text) => text.length > ANSWER_LIMIT);
  if (tooLong) {
    return { ...base, kind: "kept", reason: "answer-longer-than-255" };
  }

  const current = rowAnswers(row);
  const sameAnswers = current.every((text, index) => (text ?? "") === right[index]);
  const realAnswers = current.some((text) => !isPlaceholderMatchAnswer(text));
  const parsed = splitEmbed(row.task_text);

  if (parsed.broken) {
    return { ...base, kind: "kept", reason: "embed-broken" };
  }
  if (parsed.embed && !samePayload(parsed.embed, entry)) {
    return { ...base, kind: "kept", reason: "embed-differs" };
  }
  if (realAnswers && !sameAnswers) {
    return { ...base, kind: "kept", reason: "answers-differ" };
  }

  const nextText = parsed.embed
    ? String(row.task_text)
    : embedNmtMatch(parsed.stem, payloadOf(entry));
  const answerChanges = right
    .map((text, index) => ({
      field: `answer_${index + 1}`,
      from: current[index],
      to: text,
    }))
    .filter((change) => (change.from ?? "") !== change.to);
  const textChanges = nextText !== String(row.task_text ?? "");

  if (!textChanges && answerChanges.length === 0) {
    return { ...base, kind: "unchanged" };
  }

  return {
    ...base,
    kind: "update",
    answerChanges,
    textChanges,
    nextText,
    nextAnswers: right,
    previousText: String(row.task_text ?? ""),
    previousAnswers: current,
  };
}

function clip(text) {
  const oneLine = String(text).replace(/\s+/g, " ").trim();
  return oneLine.length > 90 ? `${oneLine.slice(0, 87)}…` : oneLine;
}

/** Human diff. Does not include the scoring key. */
export function formatNmtMatchBackfillReport(plan, { mode, database }) {
  const lines = [
    `mode: ${mode}`,
    `database: ${database}`,
    `catalog: ${plan.seenNames.length + plan.missing.length}`,
    `update: ${plan.updates.length}`,
    `unchanged: ${plan.unchanged.length}`,
    `kept: ${plan.kept.length}`,
    `missing: ${plan.missing.length}`,
    `outside-catalog: ${plan.outside.length}`,
  ];

  for (const row of plan.updates) {
    lines.push("");
    lines.push(`UPDATE id=${row.id} ${row.name}`);
    if (row.textChanges) {
      lines.push("  task_text: додано [[nmt-match]] (рядки 1–3 і варіанти А–Д), умову не замінено");
    }
    for (const change of row.answerChanges) {
      lines.push(`  ${change.field}: «${clip(change.from ?? "")}» → «${clip(change.to)}»`);
    }
  }

  for (const row of plan.kept) {
    lines.push(`KEEP id=${row.id} ${row.name} (${row.reason})`);
  }
  for (const name of plan.missing) {
    lines.push(`MISSING ${name}`);
  }
  for (const row of plan.outside) {
    lines.push(`OUTSIDE id=${row.id} ${row.name}`);
  }

  if (mode === "dry-run") {
    lines.push("");
    lines.push("dry-run: базу не змінено.");
  }
  return lines.join("\n");
}
