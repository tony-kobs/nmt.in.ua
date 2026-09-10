import { Suspense } from "react";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { NextIntlClientProvider } from "next-intl";
import { WelcomeLanding } from "@/components/welcome/WelcomeLanding";
import { createPageMetadata } from "@/constants/seo";
import { pickClientMessages } from "@/i18n/clientMessages";
import {
  getCurrentUser,
  sessionCookieNeedsUpgrade,
} from "@/modules/auth/getCurrentUser";
import { parseThemeQueryParam } from "@/modules/testing/parseThemeQueryParam";

/**
 * Root `/` lives outside `(app)` / `(marketing)` so guests skip
 * `force-dynamic` cabinet layout and fat CORE i18n.
 * Logged-in users load the cabinet chunk only via dynamic import.
 */

export async function generateMetadata() {
  const user = await getCurrentUser();

  if (!user) {
    const t = await getTranslations("Metadata.welcome");
    return createPageMetadata({
      title: t("title"),
      description: t("description"),
      path: "/",
    });
  }

  const t = await getTranslations("Metadata.home");
  return createPageMetadata({
    title: t("title"),
    description: t("description"),
    path: "/",
  });
}

type HomePageProps = {
  searchParams: Promise<{ theme?: string | string[] }>;
};

function readThemeParam(
  raw: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(raw)) {
    return raw[0];
  }
  return raw;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const user = await getCurrentUser();
  const locale = await getLocale();

  if (!user) {
    const messages = pickClientMessages(await getMessages(), "/");
    return (
      <NextIntlClientProvider locale={locale} messages={messages}>
        <WelcomeLanding />
      </NextIntlClientProvider>
    );
  }

  const params = await searchParams;
  const initialThemeId = parseThemeQueryParam(readThemeParam(params.theme));
  const needsCookieUpgrade = await sessionCookieNeedsUpgrade();

  const { CabinetHome } = await import("./_home/CabinetHome");

  return (
    <Suspense fallback={null}>
      <CabinetHome
        locale={locale}
        displayName={user.displayName}
        user={user}
        initialThemeId={initialThemeId}
        needsCookieUpgrade={needsCookieUpgrade}
      />
    </Suspense>
  );
}
