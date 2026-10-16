import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { MarathonInviteBanner } from "@/components/marathon/MarathonInviteBanner";
import { UpgradeSessionCookie } from "@/components/auth/UpgradeSessionCookie";
import { pickClientMessages } from "@/i18n/clientMessages";
import {
  getCurrentUser,
  getSessionPayload,
  sessionCookieNeedsUpgrade,
} from "@/modules/auth/getCurrentUser";
import { touchLoginSession } from "@/modules/auth/userSessions";
import { findUserById } from "@/modules/auth/users";
import type { MarathonInvite } from "@/modules/marathons/daily/invite";
import { ensureStudentMarathonInvites } from "@/modules/marathons/daily/invites";
import { getStudentMarathonHref } from "@/modules/marathons/daily/store";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

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

  let cabinetScope = user?.cabinetScope ?? "full";
  let marathonHref: string | null = null;
  let invites: MarathonInvite[] = [];
  if (user) {
    const account = await findUserById(user.id);
    if (!account || account.isBanned) {
      // Cookie mutation is illegal during RSC render — use the route handler.
      redirect("/api/auth/clear-session");
    }
    const payload = await getSessionPayload();
    if (payload?.sid) {
      try {
        await touchLoginSession(payload.userId, payload.sid);
      } catch (error) {
        console.error("presence touch failed", error);
      }
    }
    cabinetScope = account.cabinetScope ?? "full";
    if (user.role === "student") {
      marathonHref = await getStudentMarathonHref(user.id);
    }
    try {
      invites = (await ensureStudentMarathonInvites(user.id)).invites;
    } catch (error) {
      console.error("marathon invites", error);
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
          marathonHref={marathonHref}
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
