import { pickClientMessages } from "@/i18n/clientMessages";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { headers } from "next/headers";

/**
 * Public marketing / auth routes — no DashboardShell, no session DB lookup.
 * Still request-dynamic because locale comes from cookies (next-intl).
 */
export default async function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headerStore = await headers();
  const pathname = headerStore.get("x-pathname") ?? "/welcome";
  const locale = await getLocale();
  const messages = pickClientMessages(await getMessages(), pathname);

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {children}
    </NextIntlClientProvider>
  );
}
