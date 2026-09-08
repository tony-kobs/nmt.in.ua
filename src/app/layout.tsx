import type { Metadata, Viewport } from "next";
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
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { pickClientMessages } from "@/i18n/clientMessages";
import { getCurrentUser } from "@/modules/auth/getCurrentUser";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "katex/dist/katex.min.css";
import "./globals.css";

/** MySQL env is for runtime on the host; skip static prerender that hits the DB at build. */
export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLOR },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLOR },
  ],
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
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
  const messages = pickClientMessages(await getMessages());
  const user = await getCurrentUser();

  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <DashboardShell user={user}>
            {children}
          </DashboardShell>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
