import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { TopicTestStart } from "@/components/dashboard/TopicTestStart";
import { UpgradeSessionCookie } from "@/components/auth/UpgradeSessionCookie";
import { pickClientMessages } from "@/i18n/clientMessages";
import type { AuthUser } from "@/modules/auth/types";
import { getAvailableTopicThemes } from "@/modules/testing/getAvailableTopicThemes";

type CabinetHomeProps = {
  locale: string;
  user: AuthUser;
  displayName: string;
  initialThemeId?: number;
  needsCookieUpgrade: boolean;
};

/** Loaded only for authenticated `/` — keeps cabinet out of the guest graph. */
export async function CabinetHome({
  locale,
  user,
  displayName,
  initialThemeId,
  needsCookieUpgrade,
}: CabinetHomeProps) {
  const messages = pickClientMessages(await getMessages(), "/home");
  const themes = await getAvailableTopicThemes();

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {needsCookieUpgrade ? <UpgradeSessionCookie /> : null}
      <DashboardShell user={user}>
        <TopicTestStart
          themes={themes}
          initialThemeId={initialThemeId}
          displayName={displayName}
        />
      </DashboardShell>
    </NextIntlClientProvider>
  );
}
