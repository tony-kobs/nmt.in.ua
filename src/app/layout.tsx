import type { Metadata, Viewport } from "next";
import { Inter, Manrope } from "next/font/google";
import {
  SITE_DESCRIPTION,
  SITE_KEYWORDS,
  SITE_NAME,
  SITE_SHORT_NAME,
  SITE_TAGLINE,
  THEME_COLOR,
  absoluteUrl,
  createPageMetadata,
  siteIcons,
} from "@/constants/seo";
import { DeploymentSkewReload } from "@/components/status/DeploymentSkewReload";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { getLocale } from "next-intl/server";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  variable: "--font-inter",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  variable: "--font-manrope",
  display: "swap",
});

/**
 * Root shell only: html/body + global CSS.
 * Locale providers and DashboardShell live in (marketing) / (app) layouts so
 * guests do not hydrate cabinet chrome or pull a session DB lookup.
 * force-dynamic stays on (app) only.
 */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLOR },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLOR },
  ],
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  ...createPageMetadata({
    title: `${SITE_NAME} — ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    path: "/",
  }),
  metadataBase: new URL(absoluteUrl("/")),
  applicationName: SITE_NAME,
  keywords: SITE_KEYWORDS,
  authors: [{ name: SITE_NAME, url: absoluteUrl("/") }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  icons: siteIcons(),
  appleWebApp: {
    capable: true,
    title: SITE_SHORT_NAME,
    statusBarStyle: "default",
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();

  return (
    <html lang={locale} className={`${inter.variable} ${manrope.variable}`}>
      <body>
        <DeploymentSkewReload />
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
