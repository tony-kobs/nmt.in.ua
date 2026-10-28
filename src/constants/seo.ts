import type { Metadata } from "next";

export const SITE_NAME = "LevelUP";
export const SITE_SHORT_NAME = "LevelUP";
export const SITE_TAGLINE = "підготовка до НМТ з математики";

export const SITE_DESCRIPTION =
  "Онлайн-підготовка до НМТ з математики: тести за темами, аналіз результатів, симулятор іспиту та задачник. Зручний кабінет для системних тренувань у форматі УЦОЯО.";

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
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
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
  noIndex = false,
  ogImageAlt,
}: {
  title: string;
  description: string;
  path?: string;
  noIndex?: boolean;
  ogImageAlt?: string;
}): Metadata {
  const url = absoluteUrl(path);
  const fullTitle = title.includes(SITE_NAME)
    ? title
    : `${title} | ${SITE_NAME}`;
  const isHome = path === "/" || path === "";
  const ogImages = defaultOgImages();
  const imageAlt = ogImageAlt ?? DEFAULT_OG_IMAGE_ALT;

  return {
    title: isHome ? { absolute: fullTitle } : fullTitle,
    description,
    keywords: SITE_KEYWORDS,
    alternates: {
      canonical: url,
      languages: { "uk-UA": url },
    },
    category: "education",
    openGraph: {
      title: fullTitle,
      description,
      url,
      siteName: SITE_NAME,
      locale: "uk_UA",
      type: "website",
      images: ogImages.map((img) => ({
        ...img,
        alt: imageAlt,
      })),
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description,
      images: [DEFAULT_OG_IMAGE_PATH],
    },
    robots: noIndex
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
    logo: absoluteUrl(DEFAULT_OG_IMAGE_PATH),
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
