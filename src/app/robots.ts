import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/constants/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/session/"],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
