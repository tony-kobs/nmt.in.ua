import type { MetadataRoute } from "next";
import { ROBOTS_DISALLOW, absoluteUrl } from "@/constants/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [...ROBOTS_DISALLOW],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
