import type { MetadataRoute } from "next";
import { DASHBOARD_NAV } from "@/constants/navigation";
import { absoluteUrl } from "@/constants/seo";

/** Public dashboard routes for search indexing (excludes /session/* and /api/*). */
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  return [
    {
      url: absoluteUrl("/welcome"),
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: absoluteUrl("/register/teacher"),
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    ...DASHBOARD_NAV.map((item): MetadataRoute.Sitemap[number] => ({
      url: absoluteUrl(item.href),
      lastModified: now,
      changeFrequency: item.href === "/" ? "daily" : "weekly",
      priority: item.href === "/" ? 1 : 0.7,
    })),
  ];
}
