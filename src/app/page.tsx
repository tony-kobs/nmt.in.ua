import { Suspense } from "react";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { NextIntlClientProvider } from "next-intl";
import { DatabaseUnavailable } from "@/components/status/DatabaseUnavailable";
import { StatusScene } from "@/components/status/StatusScene";
import { isDatabaseUnavailable, rethrowNavigation } from "@/lib/db/unavailable";
import { WelcomeLanding } from "@/components/welcome/WelcomeLanding";
import { statusCopy } from "@/i18n/statusPages";
import { createPageMetadata } from "@/constants/seo";
import { pickClientMessages } from "@/i18n/clientMessages";
import {
  optionalLiveUser,
  sessionCookieNeedsUpgrade,
} from "@/modules/auth/getCurrentUser";
import { parseThemeQueryParam } from "@/modules/testing/parseThemeQueryParam";

/**
 * Root `/` lives outside `(app)` / `(marketing)` so guests skip
 * `force-dynamic` cabinet layout and fat CORE i18n.
 * Logged-in users load the cabinet chunk only via dynamic import.
 */

export async function generateMetadata() {
  let user;
  try {
    user = await optionalLiveUser();
  } catch (error) {
    rethrowNavigation(error);
    if (!isDatabaseUnavailable(error)) throw error;
    const t = await getTranslations("Metadata.home");
    return createPageMetadata({
      title: t("title"),
      description: t("description"),
      path: "/",
    });
  }

  if (!user) {
    const t = await getTranslations("Metadata.welcome");
    return createPageMetadata({
      title: t("title"),
      description: t("description"),
      path: "/",
    });
  }

  if (user.role === "admin") {
    const t = await getTranslations("AdminContent");
    return createPageMetadata({
      title: t("title"),
      description: t("lead"),
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
  searchParams: Promise<{
    theme?: string | string[];
    tab?: string | string[];
    page?: string | string[];
    saved?: string | string[];
  }>;
};

function readThemeParam(
  raw: string | string[] | undefined,
): string | undefined {
  if (Array.isArray(raw)) {
    return raw[0];
  }
  return raw;
}

function readPageParam(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const page = Number(value);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export default async function HomePage({ searchParams }: HomePageProps) {
  const [locale, params] = await Promise.all([getLocale(), searchParams]);
  let user;
  try {
    user = await optionalLiveUser();
  } catch (error) {
    rethrowNavigation(error);
    if (isDatabaseUnavailable(error)) return <DatabaseUnavailable />;
    throw error;
  }

  if (!user) {
    const messages = pickClientMessages(await getMessages(), "/");
    return (
      <NextIntlClientProvider locale={locale} messages={messages}>
        <WelcomeLanding />
      </NextIntlClientProvider>
    );
  }

  const initialThemeId = parseThemeQueryParam(readThemeParam(params.theme));
  const initialTab = readThemeParam(params.tab);
  const initialPage = readPageParam(params.page);
  const saved = readThemeParam(params.saved) === "1";
  const [{ CabinetHome }, needsCookieUpgrade] = await Promise.all([
    import("./_home/CabinetHome"),
    sessionCookieNeedsUpgrade(),
  ]);

  return (
    <Suspense
      fallback={
        <StatusScene variant="loading" copy={statusCopy(locale)} />
      }
    >
      <CabinetHome
        locale={locale}
        displayName={user.displayName}
        user={user}
        initialThemeId={initialThemeId}
        initialTab={initialTab}
        initialPage={initialPage}
        needsCookieUpgrade={needsCookieUpgrade}
        saved={saved}
      />
    </Suspense>
  );
}
