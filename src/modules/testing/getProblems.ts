import "server-only";

import catalog from "@/content/workbookProblems.json";
import type { SqlConnection } from "@/lib/db/mysql";
import { getThemes } from "@/modules/themes/getThemes";
import {
  isWorkbookCatalogReady,
  workbookCatalogExpected,
} from "../../../scripts/lib/workbook-catalog.mjs";
import { normalizeWorkbookPrompt } from "./workbookPrompt";
import {
  workbookThemeGroups,
  type SiteThemeName,
} from "./workbookTopicMap";

export type WorkbookTheme = {
  /** `themes.code`, or `json:<id>` when the topic has no site theme yet. */
  key: string;
  code: string | null;
  name: string;
  ord: number;
  taskCount: number;
  jsonIds: number[];
};

export type WorkbookProblem = {
  id: number;
  problemText: string;
  answers: [string, string, string, string];
  rightAnswerN: 1 | 2 | 3 | 4;
};

/** One `problems` row. `themeId` is the zadachnyk topic id, not `themes.id`. */
export type WorkbookStoredRow = {
  id: number;
  themeId: number;
  problemText: string;
  answers: [string, string, string, string];
  rightAnswerN: number;
};

export type WorkbookLoad = {
  /** True when `workbook_catalog` matches this JSON catalog and every id is present. */
  ready: boolean;
  rows: readonly WorkbookStoredRow[];
};

const NOT_READY: WorkbookLoad = { ready: false, rows: [] };

function asAnswerN(value: number): 1 | 2 | 3 | 4 {
  if (value === 1 || value === 2 || value === 3 || value === 4) return value;
  return 1;
}

function jsonIdSet(jsonIds: readonly number[]): Set<number> {
  return new Set(jsonIds);
}

type CatalogProblem = (typeof catalog.problems)[number];

function catalogRow(row: CatalogProblem): WorkbookStoredRow {
  return {
    id: row.id,
    themeId: row.theme_id,
    problemText: row.problem_text,
    answers: [row.answer_1, row.answer_2, row.answer_3, row.answer_4],
    rightAnswerN: row.right_answer_n,
  };
}

function toProblem(row: WorkbookStoredRow): WorkbookProblem {
  return {
    id: row.id,
    problemText: normalizeWorkbookPrompt(row.problemText),
    answers: row.answers,
    rightAnswerN: asAnswerN(row.rightAnswerN),
  };
}

/**
 * Printable labels come from `workbookTopicMap.json` plus live `themes.name`
 * when the database is up. Task counts come from the JSON catalog.
 */
export function listWorkbookThemesFromCatalog(
  siteThemes: readonly SiteThemeName[] = [],
): WorkbookTheme[] {
  return listWorkbookThemesFromRows(catalog.problems.map(catalogRow), siteThemes);
}

export function listWorkbookProblemsFromCatalog(themeKey: string): WorkbookProblem[] {
  return listWorkbookProblemsFromRows(catalog.problems.map(catalogRow), themeKey);
}

/** Same groups as the catalog. Counts and rows follow `themeId`, then `id`. */
export function listWorkbookThemesFromRows(
  rows: readonly WorkbookStoredRow[],
  siteThemes: readonly SiteThemeName[] = [],
): WorkbookTheme[] {
  return workbookThemeGroups(siteThemes).map((group) => {
    const ids = jsonIdSet(group.jsonIds);
    return {
      ...group,
      taskCount: rows.filter((row) => ids.has(row.themeId)).length,
    };
  });
}

export function listWorkbookProblemsFromRows(
  rows: readonly WorkbookStoredRow[],
  themeKey: string,
  siteThemes: readonly SiteThemeName[] = [],
): WorkbookProblem[] {
  const group = listWorkbookThemesFromRows(rows, siteThemes).find((theme) => theme.key === themeKey);
  if (!group) return [];
  const ids = jsonIdSet(group.jsonIds);
  return rows
    .filter((row) => ids.has(row.themeId))
    .sort((left, right) => left.id - right.id)
    .map(toProblem);
}

/**
 * `?theme=` accepts a theme code, a `json:<id>` key, or the old zadachnyk id.
 * An unknown value opens the first theme in site order.
 */
export function resolveWorkbookThemeKey(
  themes: readonly WorkbookTheme[],
  raw: string | null | undefined,
): string | null {
  if (themes.length === 0) return null;
  const value = raw?.trim() ?? "";
  if (value) {
    const direct = themes.find((theme) => theme.key === value);
    if (direct) return direct.key;
    if (/^[1-9]\d*$/.test(value)) {
      const id = Number(value);
      const legacy = themes.find((theme) => theme.jsonIds.includes(id));
      if (legacy) return legacy.key;
    }
  }
  return themes[0]?.key ?? null;
}

async function loadSiteThemeNames(): Promise<readonly SiteThemeName[]> {
  return getThemes();
}

type ProblemQueryRow = {
  id: number;
  problem_text: string;
  theme_id: number;
  answer_1: string;
  answer_2: string;
  answer_3: string;
  answer_4: string;
  right_answer_n: number;
};

function storedRow(row: ProblemQueryRow): WorkbookStoredRow {
  return {
    id: Number(row.id),
    themeId: Number(row.theme_id),
    problemText: row.problem_text ?? "",
    answers: [row.answer_1 ?? "", row.answer_2 ?? "", row.answer_3 ?? "", row.answer_4 ?? ""],
    rightAnswerN: Number(row.right_answer_n),
  };
}

async function queryWorkbook(connection: SqlConnection): Promise<WorkbookLoad> {
  const expected = workbookCatalogExpected(catalog.problems);
  const markerRows = await connection.query<{ revision: string; problem_count: number }>(
    "SELECT revision, problem_count FROM workbook_catalog WHERE id = 1",
  );
  const marker = markerRows[0];
  if (
    !marker ||
    marker.revision !== expected.revision ||
    Number(marker.problem_count) !== expected.count
  ) {
    return NOT_READY;
  }
  const placeholders = expected.ids.map(() => "?").join(", ");
  const rows = await connection.query<ProblemQueryRow>(
    `SELECT id, problem_text, theme_id, answer_1, answer_2, answer_3, answer_4, right_answer_n
     FROM problems
     WHERE id IN (${placeholders})
     ORDER BY id`,
    expected.ids,
  );
  const stored = rows.map(storedRow);
  const ready = isWorkbookCatalogReady(
    { revision: marker.revision, problemCount: Number(marker.problem_count) },
    stored.map((row) => row.id),
    expected,
  );
  return ready ? { ready: true, rows: stored } : NOT_READY;
}

async function loadWorkbookFromDatabase(): Promise<WorkbookLoad> {
  const { getConnection } = await import("@/lib/db/mysql");
  const connection = await getConnection();
  try {
    return await queryWorkbook(connection);
  } finally {
    connection.release();
  }
}

let inflightLoad: Promise<WorkbookLoad> | null = null;

/** One read per overlapping pair of theme list + task list. The result is not cached. */
function loadWorkbookShared(): Promise<WorkbookLoad> {
  if (inflightLoad) return inflightLoad;
  inflightLoad = loadWorkbookFromDatabase().finally(() => {
    inflightLoad = null;
  });
  return inflightLoad;
}

function themesFrom(load: WorkbookLoad, siteThemes: readonly SiteThemeName[]): WorkbookTheme[] {
  if (!load.ready) return listWorkbookThemesFromCatalog(siteThemes);
  return listWorkbookThemesFromRows(load.rows, siteThemes);
}

/**
 * Themes that have a printable workbook group.
 * Pass site rows in tests. The default reads `themes` and, if MySQL is down,
 * keeps the names from the map. Tasks come from `problems` when the catalog
 * marker matches, and from the JSON file until that import has run.
 */
export async function getWorkbookThemes(
  source: readonly SiteThemeName[] | (() => Promise<readonly SiteThemeName[]>) = loadSiteThemeNames,
  load: () => Promise<WorkbookLoad> = loadWorkbookShared,
): Promise<WorkbookTheme[]> {
  let siteThemes: readonly SiteThemeName[] = [];
  if (typeof source !== "function") {
    siteThemes = source;
  } else {
    try {
      siteThemes = await source();
    } catch (error) {
      console.error("workbook theme names", error);
    }
  }
  try {
    return themesFrom(await load(), siteThemes);
  } catch (error) {
    console.error("workbook problems", error);
    return listWorkbookThemesFromCatalog(siteThemes);
  }
}

/**
 * Printable tasks for one theme key, including the answer key.
 * Database rows win only when `load()` says the catalog is fully imported.
 */
export async function getWorkbookProblems(
  themeKey: string,
  load: () => Promise<WorkbookLoad> = loadWorkbookShared,
): Promise<WorkbookProblem[]> {
  try {
    const loaded = await load();
    if (loaded.ready) return listWorkbookProblemsFromRows(loaded.rows, themeKey);
  } catch (error) {
    console.error("workbook problems", error);
  }
  return listWorkbookProblemsFromCatalog(themeKey);
}
