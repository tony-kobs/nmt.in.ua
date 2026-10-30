import type { MetadataRoute } from "next";
import { PUBLIC_PAGE_PATHS } from "@/constants/publicRoutes";
import { absoluteUrl } from "@/constants/seo";
import { isDatabaseUnavailable } from "@/lib/db/unavailable";
import { SITEMAP_DAILY_STATUSES } from "@/modules/marathons/daily/publicPage";

/** `/t` is a public prefix for `/t/{slug}` cards — there is no index page.
 *  Verify/reset links are token URLs — keep them out of the sitemap.
 *  Paid `/register/teacher` is paused (redirects to `/register?role=teacher`). */
const SITEMAP_EXCLUDED = new Set([
  "/t",
  "/verify-email",
  "/keep-account",
  "/forgot-password",
  "/reset-password",
]);

const SITEMAP_PUBLIC_PATHS = [
  ...PUBLIC_PAGE_PATHS.filter((path) => !SITEMAP_EXCLUDED.has(path)),
];

const PUBLIC_SLUG = /^\/(?:marathon|t)\/[a-z0-9]+(?:-[a-z0-9]+)*$/i;

function staticEntries(now: Date): MetadataRoute.Sitemap {
  return SITEMAP_PUBLIC_PATHS.map((path) => ({
    url: absoluteUrl(path),
    lastModified: now,
    changeFrequency: path === "/" ? "daily" : "weekly",
    priority: path === "/" ? 1 : path === "/welcome" ? 0.9 : 0.6,
  }));
}

/** Shareable daily marathons (waiting page, open course, finished results) and public teacher cards. */
export async function loadSitemapDynamicPaths(): Promise<string[]> {
  const { getConnection } = await import("@/lib/db/mysql");
  const connection = await getConnection();
  try {
    const marathons = await connection.query<{ slug: string }>(
      `SELECT slug FROM marathons
       WHERE kind = 'daily' AND status IN (${SITEMAP_DAILY_STATUSES.map(() => "?").join(", ")})
       ORDER BY id DESC`,
      [...SITEMAP_DAILY_STATUSES],
    );
    const teachers = await connection.query<{ slug: string }>(
      `SELECT slug FROM teacher_profiles WHERE is_public = 1 AND slug <> '' ORDER BY slug ASC`,
    );
    return [...marathons.map((row) => `/marathon/${row.slug}`), ...teachers.map((row) => `/t/${row.slug}`)].filter(
      (path) => PUBLIC_SLUG.test(path),
    );
  } finally {
    connection.release();
  }
}

/** Public marketing URLs plus live marathon and teacher cards. Cabinet routes stay out. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const entries = staticEntries(now);
  try {
    for (const path of await loadSitemapDynamicPaths()) {
      entries.push({
        url: absoluteUrl(path),
        lastModified: now,
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
