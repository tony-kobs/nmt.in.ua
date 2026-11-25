import { getTextbookBlocks } from "@/content/learningMaterials/textbook";
import type { MaterialContentBlock } from "@/content/learningMaterials/sourceBlocks";
import { THEME_CODE_ORDER, workbookTopicLinks } from "@/modules/testing/workbookTopicMap";

const RETIRED_CODE = "MATH-05-ELEM-OPS";

/**
 * Theme codes that have no `siteName` in the workbook map.
 * The labels already exist in the conspect TOC or the theme list:
 * «Ступені та корені» is a heading in the algebra conspects,
 * the other two are the Ukrainian names of those `themes.code` rows.
 */
const FALLBACK_NAME: Record<string, string> = {
  "ALG-08-POWERS-ROOTS": "Ступені та корені",
  "ALG-08-QUAD-EQ": "Квадратні рівняння",
  "MATH-09-STATISTICS": "Статистика",
};

const LETTERS: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "h",
  ґ: "g",
  д: "d",
  е: "e",
  є: "ie",
  ж: "zh",
  з: "z",
  и: "y",
  і: "i",
  ї: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "kh",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ь: "",
  ю: "iu",
  я: "ia",
  "'": "",
  "’": "",
  "ʼ": "",
};

export type PublicNmtTopic = {
  code: string;
  /** Fallback title from the workbook map or conspect heading. DB may replace it. */
  name: string;
  slug: string;
  path: string;
  ord: number;
};

export const NMT_TOPICS_PATH = "/nmt/temy";

export function nmtTopicPath(slug: string): string {
  return `${NMT_TOPICS_PATH}/${slug}`;
}

/** Latin slug from a Ukrainian topic title. Stable, lowercase, hyphenated. */
export function slugifyUkTopic(name: string): string {
  let out = "";
  for (const char of name.toLowerCase()) {
    if (LETTERS[char] !== undefined) {
      out += LETTERS[char];
    } else if (/[a-z0-9]/.test(char)) {
      out += char;
    } else {
      out += "-";
    }
  }
  return out.replace(/-+/g, "-").replace(/^-|-$/g, "");
}

let cachedTopics: PublicNmtTopic[] | null = null;

/**
 * One public page per live NMT math theme. Retired `MATH-05-ELEM-OPS` stays out.
 * Names come from the workbook map, then the conspect labels above.
 */
export function publicNmtTopics(): PublicNmtTopic[] {
  if (cachedTopics) return cachedTopics;
  const nameByCode = new Map<string, string>();
  for (const link of workbookTopicLinks()) {
    if (!link.code || link.code === RETIRED_CODE) continue;
    if (!nameByCode.has(link.code)) nameByCode.set(link.code, link.siteName);
  }
  const used = new Set<string>();
  const topics: PublicNmtTopic[] = [];
  for (const code of THEME_CODE_ORDER) {
    if (code === RETIRED_CODE) continue;
    const name = nameByCode.get(code) ?? FALLBACK_NAME[code];
    if (!name) continue;
    let slug = slugifyUkTopic(name);
    if (!slug || used.has(slug)) slug = slugifyUkTopic(`${name}-${code}`);
    used.add(slug);
    const ord = THEME_CODE_ORDER.indexOf(code);
    topics.push({ code, name, slug, path: nmtTopicPath(slug), ord });
  }
  cachedTopics = topics;
  return topics;
}

export function publicNmtTopicBySlug(slug: string): PublicNmtTopic | null {
  const key = slug.trim().toLowerCase();
  return publicNmtTopics().find((topic) => topic.slug === key) ?? null;
}

export function publicNmtTopicByCode(code: string): PublicNmtTopic | null {
  return publicNmtTopics().find((topic) => topic.code === code) ?? null;
}

export function publicNmtTopicPaths(): string[] {
  return [NMT_TOPICS_PATH, ...publicNmtTopics().map((topic) => topic.path)];
}

function paragraphText(block: MaterialContentBlock): string {
  if (block.type !== "paragraph") return "";
  return block.runs
    .map((run) => run.text)
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

/** First real paragraph of the static conspect. Empty when the theme has no text. */
export function textbookIntro(themeCode: string, max = 480): string | null {
  for (const block of getTextbookBlocks(themeCode)) {
    const text = paragraphText(block);
    if (text.length < 80) continue;
    return clipSentences(text, max);
  }
  return null;
}

export function clipSentences(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if ([...clean].length <= max) return clean;
  const slice = [...clean].slice(0, max).join("");
  const end = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("! "), slice.lastIndexOf("? "));
  if (end >= 80) return slice.slice(0, end + 1).trim();
  const space = slice.lastIndexOf(" ");
  return (space >= 80 ? slice.slice(0, space) : slice).trim();
}

/** Cabinet destination after sign-up. The topic test stays behind auth. */
export function topicPracticePath(themeId: number | null): string {
  return themeId && Number.isInteger(themeId) && themeId > 0
    ? `/topic?theme=${themeId}`
    : "/topic";
}

export function topicCtaHref(themeId: number | null, loggedIn: boolean): string {
  const next = topicPracticePath(themeId);
  if (loggedIn) return next;
  return `/register?next=${encodeURIComponent(next)}`;
}
