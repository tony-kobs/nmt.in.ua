import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { UpgradeSessionCookie } from "@/components/auth/UpgradeSessionCookie";
import { pickClientMessages } from "@/i18n/clientMessages";
import {
  getCurrentUser,
  sessionCookieNeedsUpgrade,
} from "@/modules/auth/getCurrentUser";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { headers } from "next/headers";

/** App cabinet hits MySQL; never prerender at build. */
export const dynamic = "force-dynamic";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headerStore = await headers();
  const pathname = headerStore.get("x-pathname") ?? "/";
  const locale = await getLocale();
  const messages = pickClientMessages(await getMessages(), pathname);
  const user = await getCurrentUser();
  const needsCookieUpgrade = user
    ? await sessionCookieNeedsUpgrade()
    : false;

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {needsCookieUpgrade ? <UpgradeSessionCookie /> : null}
      {user ? (
        <DashboardShell user={user}>{children}</DashboardShell>
      ) : (
        children
      )}
    </NextIntlClientProvider>
  );
}
