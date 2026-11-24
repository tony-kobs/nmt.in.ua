import type { MetadataRoute } from "next";
import {
  absoluteUrl,
  isExcludedTeacherSlug,
  SEO_CONTENT_UPDATED,
  sitemapStaticPaths,
} from "@/constants/seo";
import { isDatabaseUnavailable } from "@/lib/db/unavailable";
import { SITEMAP_DAILY_STATUSES } from "@/modules/marathons/daily/publicPage";

/** Themes and marathon cards live in MySQL, which the build runner does not have. */
export const dynamic = "force-dynamic";

const PUBLIC_SLUG = /^\/(?:marathon|t)\/[a-z0-9]+(?:-[a-z0-9]+)*$/i;

type DatedPath = {
  path: string;
  lastModified: Date;
};

function asDate(value: Date | string | null | undefined): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string" || typeof value === "number") {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return SEO_CONTENT_UPDATED;
}

function staticEntries(): MetadataRoute.Sitemap {
  return sitemapStaticPaths().map((path) => ({
    url: absoluteUrl(path),
    lastModified: SEO_CONTENT_UPDATED,
    changeFrequency: path === "/" ? "daily" : "weekly",
    priority: path === "/" ? 1 : 0.6,
  }));
}

/**
 * Published teacher cards for sitemap.xml.
 * Drops the denylist, the local seed slug, and digits-only slugs.
 * Keeps a real card such as `/t/mikhail`.
 */
export function teacherSitemapPaths(slugs: readonly string[]): string[] {
  const seen = new Set<string>();
  const paths: string[] = [];
  for (const raw of slugs) {
    const slug = raw.trim().toLowerCase();
    if (!slug || seen.has(slug) || isExcludedTeacherSlug(slug)) continue;
    const path = `/t/${slug}`;
    if (!PUBLIC_SLUG.test(path)) continue;
    seen.add(slug);
    paths.push(path);
  }
  return paths;
}

/**
 * Shareable daily marathons and published teacher cards.
 * The textbook is behind login, so its topic URLs are not listed.
 */
export async function loadSitemapDynamicPaths(): Promise<DatedPath[]> {
  const { getConnection } = await import("@/lib/db/mysql");
  const connection = await getConnection();
  try {
    const marathons = await connection.query<{ slug: string; created_at: Date | string | null }>(
      `SELECT slug, created_at FROM marathons
       WHERE kind = 'daily' AND status IN (${SITEMAP_DAILY_STATUSES.map(() => "?").join(", ")})
       ORDER BY id DESC`,
      [...SITEMAP_DAILY_STATUSES],
    );
    const teachers = await connection.query<{ slug: string; updated_at: Date | string | null }>(
      `SELECT slug, updated_at FROM teacher_profiles
       WHERE is_public = 1 AND slug <> '' ORDER BY slug ASC`,
    );
    const teacherPaths = new Set(teacherSitemapPaths(teachers.map((row) => row.slug)));
    const seenTeachers = new Set<string>();
    const cards: DatedPath[] = [
      ...marathons.map((row) => ({
        path: `/marathon/${row.slug}`,
        lastModified: asDate(row.created_at),
      })),
    ];
    for (const row of teachers) {
      const path = `/t/${row.slug.trim().toLowerCase()}`;
      if (!teacherPaths.has(path) || seenTeachers.has(path)) continue;
      seenTeachers.add(path);
      cards.push({ path, lastModified: asDate(row.updated_at) });
    }
    return cards.filter((entry) => PUBLIC_SLUG.test(entry.path));
  } finally {
    connection.release();
  }
}

/** Public marketing URLs, live marathons, and published teacher cards. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const entries = staticEntries();
  try {
    for (const entry of await loadSitemapDynamicPaths()) {
      entries.push({
        url: absoluteUrl(entry.path),
        lastModified: entry.lastModified,
        changeFrequency: "daily",
        priority: 0.7,
      });
    }
  } catch (error) {
    if (!isDatabaseUnavailable(error)) {
      console.error("sitemap dynamic paths", error);
    }
  }
  return entries;
}
