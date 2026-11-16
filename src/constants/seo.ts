import type { Metadata } from "next";
import { PUBLIC_PAGE_PATHS } from "@/constants/publicRoutes";

export const SITE_NAME = "LevelUP";
export const SITE_SHORT_NAME = "LevelUP";
export const SITE_TAGLINE = "підготовка до НМТ з математики";

export const SITE_DESCRIPTION =
  "Онлайн-підготовка до НМТ з математики: тести за темами, симулятор іспиту, підручник і задачник у форматі УЦОЯО.";

export const SITE_KEYWORDS = [
  "НМТ",
  "НМТ 2027",
  "НМТ математика",
  "підготовка до НМТ",
  "математика НМТ",
  "тести НМТ",
  "тренажер НМТ",
  "симулятор НМТ",
  "УЦОЯО",
  "онлайн підготовка до іспиту",
  "завдання НМТ з математики",
  "nmt.in.ua",
  "LevelUP",
];

export const DEFAULT_SITE_URL = "https://nmt.in.ua";

export const THEME_COLOR = "#0f766e";
export const BACKGROUND_COLOR = "#efe8d7";

/** Open Graph / Twitter default image (1200×630). */
export const DEFAULT_OG_IMAGE_PATH = "/og/og-default.png";
export const DEFAULT_OG_IMAGE_ALT =
  "LevelUP — підготовка до НМТ з математики: тренажер, тести за темами та симулятор";

export const ICON_PATHS = {
  /** Multi-size ICO: 16, 32 and 48. Browsers request /favicon.ico even without a tag. */
  faviconIco: "/favicon.ico",
  icon32: "/icons/icon-32.png",
  icon192: "/icons/icon-192.png",
  icon512: "/icons/icon-512.png",
  appleTouch: "/icons/apple-touch-icon.png",
  maskable192: "/icons/maskable-192.png",
  maskable512: "/icons/maskable-512.png",
} as const;

export function getSiteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  return DEFAULT_SITE_URL;
}

export function absoluteUrl(path = "/"): string {
  const base = getSiteUrl();
  if (!path || path === "/") return base;
  const [pathname, query] = path.split("?");
  const normalized = pathname?.startsWith("/") ? pathname : `/${pathname ?? ""}`;
  return query ? `${base}${normalized}?${query}` : `${base}${normalized}`;
}

/** Google counts the rendered `<title>`, including the brand suffix. */
export const META_TITLE_MAX = 60;
/** Google counts the meta description. */
export const META_DESCRIPTION_MAX = 155;

const BRAND_SUFFIX = ` | ${SITE_NAME}`;

/** Stable sitemap date for pages that are not rows in MySQL. */
export const SEO_CONTENT_UPDATED = new Date("2026-11-16T00:00:00.000Z");

function squash(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function codePoints(value: string): string[] {
  return [...value];
}

/** Cuts on a word boundary and stays inside `max` code points. */
export function cutMetaText(value: string, max: number): string {
  const clean = squash(value);
  if (codePoints(clean).length <= max) return clean;
  const slice = codePoints(clean).slice(0, max).join("");
  const space = slice.lastIndexOf(" ");
  const base = space >= Math.floor(max * 0.55) ? slice.slice(0, space) : slice;
  return base.replace(/[\s,;:.!?—–-]+$/u, "").trim();
}

export function fitMetaTitle(title: string): string {
  const clean = squash(title);
  if (!clean) return SITE_NAME;
  const branded = clean.includes(SITE_NAME) ? clean : `${clean}${BRAND_SUFFIX}`;
  if (codePoints(branded).length <= META_TITLE_MAX) return branded;
  if (!clean.includes(SITE_NAME)) {
    const room = META_TITLE_MAX - codePoints(BRAND_SUFFIX).length;
    return `${cutMetaText(clean, room)}${BRAND_SUFFIX}`;
  }
  return cutMetaText(clean, META_TITLE_MAX);
}

export function fitMetaDescription(description: string): string {
  return cutMetaText(description, META_DESCRIPTION_MAX);
}

export function pagePathname(path: string): string {
  const raw = (path.split("?")[0] ?? "/").split("#")[0] || "/";
  const withSlash = raw.startsWith("/") ? raw : `/${raw}`;
  if (withSlash.length > 1 && withSlash.endsWith("/")) return withSlash.slice(0, -1);
  return withSlash || "/";
}

const PRIVATE_PREFIXES = [
  "/account",
  "/admin",
  "/assign",
  "/consultations",
  "/feedback",
  "/forgot-password",
  "/join",
  "/keep-account",
  "/leaderboard",
  "/login",
  "/materials",
  "/parent",
  "/practice",
  "/problems",
  "/profiles",
  "/promo",
  "/register",
  "/reset-password",
  "/results",
  "/session",
  "/sessions",
  "/settings",
  "/simulator",
  "/students",
  "/tasks",
  "/topic",
  "/verify-email",
  "/api",
] as const;

function hasPrivatePrefix(pathname: string): boolean {
  return PRIVATE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Cabinet, admin, auth, parent, promo and in-progress attempts stay out of
 * the index. A public marathon is exactly `/marathon/{slug}`. A published
 * teacher card is exactly `/t/{slug}`.
 */
export function isNoIndexPath(path: string): boolean {
  const pathname = pagePathname(path);
  if (hasPrivatePrefix(pathname)) return true;
  if (pathname === "/diagnostic" || pathname.startsWith("/diagnostic/session")) {
    return pathname !== "/diagnostic";
  }
  if (pathname === "/marathon" || /^\/marathon\/[^/]+\/.+/.test(pathname)) return true;
  return false;
}

/** Paths a guest can open and that belong in the sitemap. */
export function sitemapStaticPaths(): string[] {
  return PUBLIC_PAGE_PATHS.filter((path) => path !== "/t" && !isNoIndexPath(path));
}

/**
 * robots.txt prefixes. `/session/` does not hide `/sessions`.
 * Marathon wildcards hide the cabinet day, not the public landing.
 */
export const ROBOTS_DISALLOW = [
  "/api/",
  "/account",
  "/admin",
  "/assign",
  "/consultations",
  "/diagnostic/session",
  "/feedback",
  "/forgot-password",
  "/join",
  "/keep-account",
  "/leaderboard",
  "/login",
  "/marathon/*/day",
  "/marathon/*/final",
  "/marathon/*/join",
  "/marathon/*/map",
  "/materials",
  "/parent",
  "/practice",
  "/problems",
  "/profiles",
  "/promo",
  "/register",
  "/reset-password",
  "/results",
  "/session/",
  "/sessions",
  "/settings",
  "/simulator",
  "/students",
  "/tasks",
  "/topic",
  "/verify-email",
] as const;

/**
 * Search Console HTML-tag token. Bracket access stays a runtime read:
 * `process.env.NEXT_PUBLIC_*` would be inlined empty at `next build`.
 */
export function googleSiteVerification(): string | undefined {
  const value = process.env["NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION"];
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || undefined;
}

/**
 * Next appends a 6-char hash when a metadata image sits in a route group.
 * Same djb2 as `next/dist/shared/lib/hash.js`, so the meta URL matches the file.
 */
export function metadataGroupSuffix(parentPath: string): string {
  let hash = 5381;
  for (let i = 0; i < parentPath.length; i += 1) {
    hash = ((hash << 5) + hash + parentPath.charCodeAt(i)) & 0xffffffff;
  }
  return (hash >>> 0).toString(36).slice(0, 6);
}

function groupedOg(groupParent: string, pathname: string): string {
  return `${pathname}/opengraph-image-${metadataGroupSuffix(groupParent)}`;
}

/** File-based `opengraph-image.tsx` for this path, or the root card. */
export function ogImagePathFor(path: string): string {
  const pathname = pagePathname(path);
  if (pathname === "/diagnostic") {
    return groupedOg("/(marketing)/diagnostic", pathname);
  }
  if (pathname.startsWith("/interns/")) {
    return groupedOg(`/(marketing)${pathname}`, pathname);
  }
  const teacher = pathname.match(/^\/t\/([^/]+)$/);
  if (teacher) return groupedOg("/(marketing)/t/[slug]", pathname);
  const marathon = pathname.match(/^\/marathon\/([^/]+)$/);
  if (marathon && !pathname.slice("/marathon/".length).includes("/")) {
    return groupedOg("/(marketing)/marathon/[slug]", pathname);
  }
  return "/opengraph-image";
}

export function defaultOgImages(): Array<{
  url: string;
  width: number;
  height: number;
  alt: string;
  type: string;
}> {
  return [
    {
      url: DEFAULT_OG_IMAGE_PATH,
      width: 1200,
      height: 630,
      alt: DEFAULT_OG_IMAGE_ALT,
      type: "image/png",
    },
  ];
}

export function createPageMetadata({
  title,
  description,
  path = "/",
  canonicalPath,
  noIndex = false,
  ogImageAlt,
}: {
  title: string;
  description: string;
  path?: string;
  /** When the page duplicates another URL. `/welcome` points at `/`. */
  canonicalPath?: string;
  noIndex?: boolean;
  ogImageAlt?: string;
}): Metadata {
  const url = absoluteUrl(canonicalPath ?? path);
  const fullTitle = fitMetaTitle(title);
  const summary = fitMetaDescription(description);
  const isHome = path === "/" || path === "";
  const hide = noIndex || isNoIndexPath(path);
  const imageAlt = ogImageAlt ?? DEFAULT_OG_IMAGE_ALT;
  const imagePath = ogImagePathFor(path);

  return {
    title: isHome ? { absolute: fullTitle } : fullTitle,
    description: summary,
    keywords: SITE_KEYWORDS,
    alternates: {
      canonical: url,
    },
    category: "education",
    openGraph: {
      title: fullTitle,
      description: summary,
      url,
      siteName: SITE_NAME,
      locale: "uk_UA",
      type: "website",
      images: [
        {
          url: imagePath,
          width: 1200,
          height: 630,
          alt: imageAlt,
          type: "image/png",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description: summary,
      images: [imagePath],
    },
    robots: hide
      ? { index: false, follow: false, nocache: true }
      : {
          index: true,
          follow: true,
          googleBot: {
            index: true,
            follow: true,
            "max-image-preview": "large",
            "max-snippet": -1,
            "max-video-preview": -1,
          },
        },
  };
}

/**
 * One set of brand icons. `app/favicon.ico` is not used: Next would also emit
 * a hardcoded 16×16 link and the old file was the default triangle.
 */
export function siteIcons(): Metadata["icons"] {
  return {
    icon: [
      {
        url: ICON_PATHS.faviconIco,
        sizes: "16x16 32x32 48x48",
        type: "image/x-icon",
      },
      { url: ICON_PATHS.icon32, sizes: "32x32", type: "image/png" },
      { url: ICON_PATHS.icon192, sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: ICON_PATHS.appleTouch, sizes: "180x180", type: "image/png" }],
  };
}

export function buildWebsiteJsonLd() {
  const siteUrl = getSiteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${siteUrl}/#website`,
    url: siteUrl,
    name: SITE_NAME,
    description: SITE_DESCRIPTION,
    inLanguage: "uk-UA",
    publisher: { "@id": `${siteUrl}/#organization` },
  };
}

export function buildOrganizationJsonLd() {
  const siteUrl = getSiteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${siteUrl}/#organization`,
    name: SITE_NAME,
    url: siteUrl,
    logo: absoluteUrl(ICON_PATHS.icon512),
    description: SITE_DESCRIPTION,
  };
}

export function buildWebApplicationJsonLd() {
  const siteUrl = getSiteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "@id": `${siteUrl}/#webapp`,
    name: SITE_NAME,
    url: siteUrl,
    description: SITE_DESCRIPTION,
    applicationCategory: "EducationalApplication",
    operatingSystem: "Web",
    browserRequirements: "Requires JavaScript",
    inLanguage: "uk-UA",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "UAH",
    },
    publisher: { "@id": `${siteUrl}/#organization` },
  };
}

export type BreadcrumbItem = {
  name: string;
  path: string;
};

export function buildBreadcrumbJsonLd(items: readonly BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}

export function buildFaqJsonLd(items: readonly { question: string; answer: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}

/** Exam prep. Course fits this site better than an occupational program. */
export function buildCourseJsonLd(input: {
  id: string;
  name: string;
  description: string;
  path: string;
  teaches?: string;
}) {
  const siteUrl = getSiteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "Course",
    "@id": input.id,
    name: input.name,
    description: fitMetaDescription(input.description),
    url: absoluteUrl(input.path),
    provider: { "@id": `${siteUrl}/#organization` },
    inLanguage: "uk-UA",
    isAccessibleForFree: true,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "UAH",
      availability: "https://schema.org/InStock",
    },
    ...(input.teaches ? { teaches: input.teaches } : {}),
  };
}

export function buildPrepCourseJsonLd() {
  const siteUrl = getSiteUrl();
  return buildCourseJsonLd({
    id: `${siteUrl}/#course`,
    name: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    path: "/",
    teaches: "Математика НМТ",
  });
}

export function buildTeacherProfileJsonLd(input: {
  name: string;
  path: string;
  headline?: string | null;
  description?: string | null;
  city?: string | null;
  country?: string | null;
  contactUrl?: string | null;
  image?: string | null;
  worksFor?: boolean;
}) {
  const siteUrl = getSiteUrl();
  const url = absoluteUrl(input.path);
  const personId = `${url}#person`;
  const person: Record<string, unknown> = {
    "@type": "Person",
    "@id": personId,
    name: input.name,
    url,
  };
  if (input.worksFor !== false) {
    person.worksFor = { "@id": `${siteUrl}/#organization` };
  }
  if (input.headline) person.jobTitle = input.headline;
  if (input.description) person.description = input.description;
  if (input.image) person.image = input.image;
  if (input.city || input.country) {
    person.address = {
      "@type": "PostalAddress",
      ...(input.city ? { addressLocality: input.city } : {}),
      ...(input.country ? { addressCountry: input.country } : {}),
    };
  }
  if (input.contactUrl) person.sameAs = [input.contactUrl];

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ProfilePage",
        "@id": `${url}#profile`,
        url,
        name: input.name,
        inLanguage: "uk-UA",
        isPartOf: { "@id": `${siteUrl}/#website` },
        mainEntity: { "@id": personId },
      },
      person,
    ],
  };
}
