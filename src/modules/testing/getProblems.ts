import "server-only";

import catalog from "@/content/workbookProblems.json";
import { getThemes } from "@/modules/themes/getThemes";
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

function asAnswerN(value: number): 1 | 2 | 3 | 4 {
  if (value === 1 || value === 2 || value === 3 || value === 4) return value;
  return 1;
}

function jsonIdSet(jsonIds: readonly number[]): Set<number> {
  return new Set(jsonIds);
}

/**
 * Printable workbook labels come from `workbookTopicMap.json` (themes.code)
 * plus live `themes.name` when the database is up. Tasks stay in the JSON catalog.
 * Numeric zadachnyk ids are not `themes.id`.
 */
export function listWorkbookThemesFromCatalog(
  siteThemes: readonly SiteThemeName[] = [],
): WorkbookTheme[] {
  return workbookThemeGroups(siteThemes).map((group) => {
    const ids = jsonIdSet(group.jsonIds);
    return {
      ...group,
      taskCount: catalog.problems.filter((row) => ids.has(row.theme_id)).length,
    };
  });
}

export function listWorkbookProblemsFromCatalog(themeKey: string): WorkbookProblem[] {
  const group = listWorkbookThemesFromCatalog().find((theme) => theme.key === themeKey);
  if (!group) return [];
  const ids = jsonIdSet(group.jsonIds);
  return catalog.problems
    .filter((row) => ids.has(row.theme_id))
    .map((row) => ({
      id: row.id,
      problemText: normalizeWorkbookPrompt(row.problem_text),
      answers: [row.answer_1, row.answer_2, row.answer_3, row.answer_4],
      rightAnswerN: asAnswerN(row.right_answer_n),
    }));
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

/**
 * Themes that have at least one printable workbook task.
 * Pass site rows in tests. The default reads `themes` and, if MySQL is down,
 * keeps the names from the map so the page still opens.
 */
export async function getWorkbookThemes(
  source: readonly SiteThemeName[] | (() => Promise<readonly SiteThemeName[]>) = loadSiteThemeNames,
): Promise<WorkbookTheme[]> {
  if (typeof source !== "function") return listWorkbookThemesFromCatalog(source);
  try {
    return listWorkbookThemesFromCatalog(await source());
  } catch (error) {
    console.error("workbook theme names", error);
    return listWorkbookThemesFromCatalog();
  }
}

/** All printable tasks for one theme key, including the answer key — JSON only. */
export async function getWorkbookProblems(themeKey: string): Promise<WorkbookProblem[]> {
  return listWorkbookProblemsFromCatalog(themeKey);
}
