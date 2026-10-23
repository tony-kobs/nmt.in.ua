import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { LandingFooter } from "@/components/welcome/LandingFooter";
import { MarathonInviteBanner } from "@/components/marathon/MarathonInviteBanner";
import { UpgradeSessionCookie } from "@/components/auth/UpgradeSessionCookie";
import { pickClientMessages } from "@/i18n/clientMessages";
import {
  getSessionPayload,
  optionalLiveUser,
  sessionCookieNeedsUpgrade,
} from "@/modules/auth/getCurrentUser";
import { touchLoginSession } from "@/modules/auth/userSessions";
import type { MarathonInvite } from "@/modules/marathons/daily/invite";
import { ensureStudentMarathonInvites } from "@/modules/marathons/daily/invites";
import { ensureTopicTestReminders } from "@/modules/notifications/topicReminders";
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
  const user = await optionalLiveUser();

  let cabinetScope = user?.cabinetScope ?? "full";
  let invites: MarathonInvite[] = [];
  if (user) {
    const payload = await getSessionPayload();
    if (payload?.sid) {
      try {
        await touchLoginSession(payload.userId, payload.sid);
      } catch (error) {
        console.error("presence touch failed", error);
      }
    }
    cabinetScope = user.cabinetScope ?? "full";
    try {
      invites = (await ensureStudentMarathonInvites(user.id)).invites;
    } catch (error) {
      console.error("marathon invites", error);
    }
    if (user.role === "student") {
      try {
        await ensureTopicTestReminders(user.id);
      } catch (error) {
        console.error("topic test reminders", error);
      }
    }
  }

  const needsCookieUpgrade = user
    ? await sessionCookieNeedsUpgrade()
    : false;

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {needsCookieUpgrade ? <UpgradeSessionCookie /> : null}
      {user ? (
        <DashboardShell
          user={user}
          cabinetScope={cabinetScope}
          footer={<LandingFooter variant="cabinet" />}
        >
          <MarathonInviteBanner invites={invites} />
          {children}
        </DashboardShell>
      ) : (
        children
      )}
    </NextIntlClientProvider>
  );
}
