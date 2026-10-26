import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { AdminContentEditor } from "@/components/admin/AdminContentEditor";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { LandingFooter } from "@/components/welcome/LandingFooter";
import { PageFrame } from "@/components/dashboard/PageFrame";
import { StudentToday } from "@/components/dashboard/StudentToday";
import { MarathonHomeCards } from "@/components/marathon/MarathonHomeCards";
import { MarathonInviteBanner } from "@/components/marathon/MarathonInviteBanner";
import { UpgradeSessionCookie } from "@/components/auth/UpgradeSessionCookie";
import { pickClientMessages } from "@/i18n/clientMessages";
import {
  getAdminThemes,
  getQuizTasksByTheme,
  ADMIN_TASKS_PAGE_SIZE,
} from "@/modules/admin-content";
import { findUserById } from "@/modules/auth/users";
import { canImportContent, type AuthUser } from "@/modules/auth/types";
import { SavedToast } from "@/components/marathon/SavedToast";
import { ensureStudentMarathonInvites } from "@/modules/marathons/daily/invites";
import { ensureTopicTestReminders } from "@/modules/notifications/topicReminders";
import { DatabaseUnavailable } from "@/components/status/DatabaseUnavailable";
import { isDatabaseUnavailable, rethrowNavigation } from "@/lib/db/unavailable";
import { loadStudentToday } from "@/modules/today/loadStudentToday";

type CabinetHomeProps = {
  locale: string;
  user: AuthUser;
  displayName: string;
  initialThemeId?: number;
  initialTab?: string;
  initialPage?: number;
  needsCookieUpgrade: boolean;
  saved?: boolean;
};

/** Loaded only for authenticated `/` — keeps cabinet out of the guest graph. */
export async function CabinetHome(props: CabinetHomeProps) {
  try {
    return await CabinetHomeLoaded(props);
  } catch (error) {
    rethrowNavigation(error);
    if (isDatabaseUnavailable(error)) return <DatabaseUnavailable />;
    throw error;
  }
}

async function CabinetHomeLoaded({
  locale,
  user,
  displayName,
  initialThemeId,
  initialTab,
  initialPage = 1,
  needsCookieUpgrade,
  saved = false,
}: CabinetHomeProps) {
  const account = user.role === "student" ? await findUserById(user.id) : null;
  const cabinetScope = account?.cabinetScope ?? "full";
  const home =
    user.role === "student"
      ? await ensureStudentMarathonInvites(user.id).catch((error: unknown) => {
          console.error("marathon home", error);
          return { cards: [], invites: [], spotlight: null };
        })
      : { cards: [], invites: [], spotlight: null };

  if (user.role === "student") {
    await ensureTopicTestReminders(user.id).catch((error: unknown) => {
      console.error("topic test reminders", error);
    });
  }

  if (user.role === "teacher") {
    redirect("/assign");
  }

  const savedText = saved ? (await getTranslations("Marathon"))("saved") : "";

  if (canImportContent(user.role)) {
    const [rawMessages, t, themes] = await Promise.all([
      getMessages(),
      getTranslations("AdminContent"),
      getAdminThemes(),
    ]);
    const messages = pickClientMessages(rawMessages, "/home");
    const themeId =
      initialThemeId && themes.some((theme) => theme.id === initialThemeId)
        ? initialThemeId
        : themes[0]?.id;
    const taskPage = themeId
      ? await getQuizTasksByTheme(themeId, { page: initialPage })
      : {
          items: [],
          total: 0,
          page: 1,
          pageSize: ADMIN_TASKS_PAGE_SIZE,
          totalPages: 1,
        };

    return (
      <NextIntlClientProvider locale={locale} messages={messages}>
        {needsCookieUpgrade ? <UpgradeSessionCookie /> : null}
        <DashboardShell user={user} footer={<LandingFooter variant="cabinet" />}>
          <SavedToast active={saved} text={savedText} />
          <PageFrame
            kicker={t("kicker")}
            title={t("title")}
            lead={t("lead")}
          >
            <AdminContentEditor
              themes={themes}
              initialThemeId={themeId}
              taskPage={taskPage}
            />
          </PageFrame>
        </DashboardShell>
      </NextIntlClientProvider>
    );
  }

  if (initialThemeId || initialTab === "interactive") {
    const query = new URLSearchParams();
    if (initialThemeId) query.set("theme", String(initialThemeId));
    if (initialTab === "interactive") query.set("tab", "interactive");
    redirect(`/topic?${query.toString()}`);
  }

  const [rawMessages, today] = await Promise.all([
    getMessages(),
    loadStudentToday(user.id),
  ]);
  const messages = pickClientMessages(rawMessages, "/home");

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {needsCookieUpgrade ? <UpgradeSessionCookie /> : null}
      <DashboardShell
        user={user}
        cabinetScope={cabinetScope}
        footer={<LandingFooter variant="cabinet" />}
      >
        <SavedToast active={saved} text={savedText} />
        <MarathonInviteBanner invites={home.invites} />
        <MarathonHomeCards cards={home.cards} spotlight={home.spotlight} signedIn />
        <StudentToday displayName={displayName} model={today} />
      </DashboardShell>
    </NextIntlClientProvider>
  );
}
