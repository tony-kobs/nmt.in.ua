import type { MetadataRoute } from "next";
import { absoluteUrl, SEO_CONTENT_UPDATED, sitemapStaticPaths } from "@/constants/seo";
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
    priority: path === "/" ? 1 : path === "/welcome" ? 0.9 : 0.6,
  }));
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
    const cards: DatedPath[] = [
      ...marathons.map((row) => ({
        path: `/marathon/${row.slug}`,
        lastModified: asDate(row.created_at),
      })),
      ...teachers.map((row) => ({
        path: `/t/${row.slug}`,
        lastModified: asDate(row.updated_at),
      })),
    ];
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
