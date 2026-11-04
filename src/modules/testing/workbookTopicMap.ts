import topicMap from "@/content/workbookTopicMap.json";

/**
 * Order of `themes.code` in `scripts/sql/010_theme_codes.sql` (historical id).
 * Workbook topics without a live `themes.ord` sort by this list.
 * MATH-05-ELEM-OPS stays here so the indexes match the file; no workbook topic uses it.
 */
export const THEME_CODE_ORDER = [
  "MATH-05-ELEM-OPS",
  "MATH-06-ARITH-OPS",
  "GEO-07-ELEM-PLAN",
  "ALG-09-EQ-INEQ",
  "ALG-08-FRACTIONS",
  "ALG-07-EXPRESSIONS",
  "GEO-07-CALC",
  "ALG-07-EQ",
  "GEO-07-PROOFS",
  "ALG-08-POWERS-ROOTS",
  "ALG-08-QUAD-EQ",
  "MATH-07-WORD-PROBLEMS",
  "ALG-07-COORD-PLANE",
  "ALG-09-FUNCTIONS",
  "ALG-11-LOGARITHMS",
  "ALG-10-TRIG",
  "ALG-11-LIMITS",
  "ALG-11-DERIVATIVE",
  "ALG-11-INTEGRALS",
  "GEO-10-STEREOMETRY",
  "ALG-09-COMB-PROG",
  "MATH-09-PROBABILITY",
  "MATH-09-STATISTICS",
] as const;

const CODE = /^[A-Z][A-Z0-9]*(-[A-Z0-9]+)*$/;
const RETIRED_CODE = "MATH-05-ELEM-OPS";
const NAME_SOURCES = new Set(["conspect", "migration", "curriculum", "json"]);

export type WorkbookTopicConfidence = "high" | "review";

export type WorkbookTopicLink = {
  jsonId: number;
  jsonName: string;
  code: string | null;
  siteName: string;
  nameSource: "conspect" | "migration" | "curriculum" | "json";
  confidence: WorkbookTopicConfidence;
  note: string;
};

export type SiteThemeName = {
  code: string;
  name: string;
  ord: number;
};

export type WorkbookThemeGroup = {
  /** `themes.code`, or `json:<id>` when the topic has no site theme yet. */
  key: string;
  code: string | null;
  name: string;
  ord: number;
  jsonIds: number[];
};

let cachedLinks: WorkbookTopicLink[] | null = null;

/** JSON topic id from the zadachnyk catalog → `themes.code`. One row per JSON topic. */
export function workbookTopicLinks(): WorkbookTopicLink[] {
  if (cachedLinks) return cachedLinks;
  const topics = topicMap.topics;
  if (topics.length === 0) {
    throw new Error("workbookTopicMap: empty");
  }
  const seen = new Set<number>();
  const siteNameByCode = new Map<string, string>();
  const links = topics.map((topic, index) => {
    const label = `workbookTopicMap row ${index + 1}`;
    if (!Number.isInteger(topic.jsonId) || topic.jsonId < 1) {
      throw new Error(`${label}: jsonId`);
    }
    if (seen.has(topic.jsonId)) {
      throw new Error(`${label}: duplicate jsonId ${topic.jsonId}`);
    }
    seen.add(topic.jsonId);
    const jsonName = topic.jsonName.trim();
    if (!jsonName) throw new Error(`${label}: jsonName`);
    const code = topic.code;
    if (code !== null && (code === RETIRED_CODE || !CODE.test(code))) {
      throw new Error(`${label}: code`);
    }
    if (code && !THEME_CODE_ORDER.includes(code as (typeof THEME_CODE_ORDER)[number])) {
      throw new Error(`${label}: unknown code ${code}`);
    }
    const siteName = topic.siteName.trim();
    if (!siteName) throw new Error(`${label}: siteName`);
    if (code) {
      const previous = siteNameByCode.get(code);
      if (previous && previous !== siteName) {
        throw new Error(`${label}: siteName disagrees for ${code}`);
      }
      siteNameByCode.set(code, siteName);
    }
    if (topic.confidence !== "high" && topic.confidence !== "review") {
      throw new Error(`${label}: confidence`);
    }
    const confidence: WorkbookTopicConfidence = topic.confidence;
    if (!NAME_SOURCES.has(topic.nameSource)) {
      throw new Error(`${label}: nameSource`);
    }
    const note = topic.note.trim();
    if (!note) throw new Error(`${label}: note`);
    return {
      jsonId: topic.jsonId,
      jsonName,
      code,
      siteName,
      nameSource: topic.nameSource as WorkbookTopicLink["nameSource"],
      confidence,
      note,
    };
  });
  cachedLinks = links;
  return links;
}

/**
 * `problems.theme_id` stores the zadachnyk topic id, not `themes.id`.
 * The CASE is the same map the workbook page uses, so a fraction is not labeled as an inequality.
 */
export function problemThemeCodeCaseSql(column = "p.theme_id"): string {
  if (!/^[a-z]+\.[a-z_]+$/.test(column)) {
    throw new Error("problemThemeCodeCaseSql: column");
  }
  const whens = workbookTopicLinks()
    .filter((link) => link.code)
    .sort((a, b) => a.jsonId - b.jsonId)
    .map((link) => `WHEN ${link.jsonId} THEN '${link.code}'`);
  return `CASE ${column} ${whens.join(" ")} ELSE NULL END`;
}

export function problemThemeJoinSql(): string {
  return `LEFT JOIN themes t ON t.code = ${problemThemeCodeCaseSql("p.theme_id")}`;
}

function ordOf(
  code: string | null,
  jsonId: number,
  live: ReadonlyMap<string, SiteThemeName>,
): number {
  if (code) {
    const theme = live.get(code);
    if (theme) return theme.ord;
    const index = THEME_CODE_ORDER.indexOf(code as (typeof THEME_CODE_ORDER)[number]);
    if (index >= 0) return index;
  }
  return 10_000 + jsonId;
}

/**
 * One group per `themes.code`. JSON topics that share a code become one workbook topic.
 * A topic with `code: null` stays on its own and keeps the JSON name.
 * Live `themes.name` / `themes.ord` win when `siteThemes` has that code.
 */
export function workbookThemeGroups(
  siteThemes: readonly SiteThemeName[] = [],
): WorkbookThemeGroup[] {
  const live = new Map<string, SiteThemeName>();
  for (const theme of siteThemes) {
    const code = theme.code.trim();
    if (!code || live.has(code)) continue;
    live.set(code, { code, name: theme.name.trim(), ord: theme.ord });
  }

  const grouped = new Map<string, WorkbookThemeGroup>();
  for (const link of workbookTopicLinks()) {
    const key = link.code ?? `json:${link.jsonId}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.jsonIds.push(link.jsonId);
      existing.jsonIds.sort((a, b) => a - b);
      continue;
    }
    const fromSite = link.code ? live.get(link.code) : undefined;
    grouped.set(key, {
      key,
      code: link.code,
      name: fromSite?.name || link.siteName,
      ord: ordOf(link.code, link.jsonId, live),
      jsonIds: [link.jsonId],
    });
  }

  return [...grouped.values()].sort((a, b) => {
    if (a.code && !b.code) return -1;
    if (!a.code && b.code) return 1;
    return a.ord - b.ord || a.key.localeCompare(b.key, "en");
  });
}
