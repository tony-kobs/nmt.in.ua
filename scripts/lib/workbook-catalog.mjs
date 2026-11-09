/**
 * Printable workbook catalog shared by `/problems` and `scripts/import-workbook.mjs`.
 * The revision is a hash of the JSON rows. The page reads MySQL only when
 * `workbook_catalog.revision` equals this hash and every catalog id is present.
 * Until then it keeps `src/content/workbookProblems.json`.
 */
import { createHash } from "node:crypto";

const UPSERT_COLUMNS = [
  "id",
  "name",
  "problem_text",
  "theme_id",
  "answer_1",
  "answer_2",
  "answer_3",
  "answer_4",
  "right_answer_n",
  "comments",
  "difficulty",
];

export const WORKBOOK_UPSERT_CHUNK = 40;

function asNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? String(number) : "";
}

function asText(value) {
  return value == null ? "" : String(value);
}

/** Stable line for one catalog row. Field order is the hash and the equality check. */
export function workbookProblemKey(problem) {
  return [
    asNumber(problem.id),
    asNumber(problem.theme_id),
    asNumber(problem.right_answer_n),
    asNumber(problem.difficulty),
    asText(problem.name),
    asText(problem.problem_text),
    asText(problem.answer_1),
    asText(problem.answer_2),
    asText(problem.answer_3),
    asText(problem.answer_4),
    asText(problem.comments),
  ].join("\u0001");
}

/** SHA-256 of the catalog. Sort by id so file order cannot change the revision. */
export function workbookCatalogRevision(problems) {
  const ordered = [...problems].sort((left, right) => Number(left.id) - Number(right.id));
  const hash = createHash("sha256");
  for (const problem of ordered) {
    hash.update(workbookProblemKey(problem));
    hash.update("\n");
  }
  return hash.digest("hex");
}

export function workbookCatalogExpected(problems) {
  const ordered = [...problems].sort((left, right) => Number(left.id) - Number(right.id));
  return {
    revision: workbookCatalogRevision(ordered),
    count: ordered.length,
    ids: ordered.map((problem) => Number(problem.id)),
  };
}

/**
 * True only when the marker names this catalog and every catalog id came back.
 * A shorter list, a different hash, or a missing marker keeps the JSON page.
 */
export function isWorkbookCatalogReady(marker, presentIds, expected) {
  if (!marker || marker.revision !== expected.revision) return false;
  if (Number(marker.problemCount) !== expected.count) return false;
  if (!Array.isArray(presentIds) || presentIds.length !== expected.count) return false;
  const have = new Set(presentIds.map((id) => Number(id)));
  if (have.size !== expected.count) return false;
  return expected.ids.every((id) => have.has(id));
}

export function planWorkbookImport(existingIds, catalogIds) {
  const have = new Set(existingIds.map((id) => Number(id)));
  let insert = 0;
  let update = 0;
  for (const id of catalogIds) {
    if (have.has(Number(id))) update += 1;
    else insert += 1;
  }
  return { insert, update, total: catalogIds.length };
}

export function countWorkbookChanges(existingRows, catalogProblems) {
  const byId = new Map(existingRows.map((row) => [Number(row.id), workbookProblemKey(row)]));
  let missing = 0;
  let different = 0;
  let same = 0;
  const sampleIds = [];
  for (const problem of catalogProblems) {
    const current = byId.get(Number(problem.id));
    if (current === undefined) {
      missing += 1;
      if (sampleIds.length < 8) sampleIds.push(Number(problem.id));
      continue;
    }
    if (current !== workbookProblemKey(problem)) {
      different += 1;
      if (sampleIds.length < 8) sampleIds.push(Number(problem.id));
      continue;
    }
    same += 1;
  }
  return { missing, different, same, sampleIds };
}

export function chunkProblems(problems, size = WORKBOOK_UPSERT_CHUNK) {
  if (!Number.isInteger(size) || size < 1) {
    throw new Error("workbook chunk size");
  }
  const chunks = [];
  for (let index = 0; index < problems.length; index += size) {
    chunks.push(problems.slice(index, index + size));
  }
  return chunks;
}

/**
 * Alias form (`AS incoming`) works on MySQL 8.0.19+ and 8.4.
 * `VALUES(col)` in ON DUPLICATE KEY UPDATE is gone in 8.4.
 * The statement never deletes a row.
 */
export function problemUpsertSql(rowCount) {
  if (!Number.isInteger(rowCount) || rowCount < 1) {
    throw new Error("workbook upsert size");
  }
  const row = `(${UPSERT_COLUMNS.map(() => "?").join(", ")})`;
  const values = Array.from({ length: rowCount }, () => row).join(", ");
  const assignments = UPSERT_COLUMNS.filter((column) => column !== "id")
    .map((column) => `${column} = incoming.${column}`)
    .join(", ");
  return `INSERT INTO problems (${UPSERT_COLUMNS.join(", ")}) VALUES ${values} AS incoming ON DUPLICATE KEY UPDATE ${assignments}`;
}

export function problemUpsertParams(problems) {
  return problems.flatMap((problem) => [
    Number(problem.id),
    asText(problem.name),
    asText(problem.problem_text),
    Number(problem.theme_id),
    asText(problem.answer_1),
    asText(problem.answer_2),
    asText(problem.answer_3),
    asText(problem.answer_4),
    Number(problem.right_answer_n),
    asText(problem.comments),
    Number(problem.difficulty),
  ]);
}

export const SQL_UPSERT_WORKBOOK_MARKER = `INSERT INTO workbook_catalog (id, revision, problem_count)
VALUES (1, ?, ?) AS incoming
ON DUPLICATE KEY UPDATE
  revision = incoming.revision,
  problem_count = incoming.problem_count,
  loaded_at = CURRENT_TIMESTAMP`;

export function parseImportArgs(argv) {
  if (argv.includes("-h") || argv.includes("--help")) return { help: true };
  const unknown = argv.filter((arg) => arg !== "--apply");
  if (unknown.length > 0) return { error: unknown[0] };
  return { apply: argv.includes("--apply") };
}
