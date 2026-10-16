import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { AdminContentEditor } from "@/components/admin/AdminContentEditor";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { PageFrame } from "@/components/dashboard/PageFrame";
import { TopicTestStart } from "@/components/dashboard/TopicTestStart";
import { UpgradeSessionCookie } from "@/components/auth/UpgradeSessionCookie";
import { pickClientMessages } from "@/i18n/clientMessages";
import {
  getAdminThemes,
  getQuizTasksByTheme,
  ADMIN_TASKS_PAGE_SIZE,
} from "@/modules/admin-content";
import { findUserById } from "@/modules/auth/users";
import { canImportContent, type AuthUser } from "@/modules/auth/types";
import {
  isMarathonOnlyStudent,
} from "@/modules/marathons/daily/access";
import { SavedToast } from "@/components/marathon/SavedToast";
import { withSavedFlag } from "@/modules/marathons/daily/channelPath";
import { getStudentMarathonHref } from "@/modules/marathons/daily/store";
import { getAvailableTopicThemes } from "@/modules/testing/getAvailableTopicThemes";
import { countStage2CatalogTasks } from "@/modules/stage2/rounds";

type CabinetHomeProps = {
  locale: string;
  user: AuthUser;
  displayName: string;
  initialThemeId?: number;
  initialPage?: number;
  needsCookieUpgrade: boolean;
  saved?: boolean;
};

/** Loaded only for authenticated `/` — keeps cabinet out of the guest graph. */
export async function CabinetHome({
  locale,
  user,
  displayName,
  initialThemeId,
  initialPage = 1,
  needsCookieUpgrade,
  saved = false,
}: CabinetHomeProps) {
  const account = user.role === "student" ? await findUserById(user.id) : null;
  const cabinetScope = account?.cabinetScope ?? "full";
  const marathonHref =
    user.role === "student" ? await getStudentMarathonHref(user.id) : null;
  if (isMarathonOnlyStudent(user.role, cabinetScope)) {
    redirect(withSavedFlag(marathonHref ?? "/account", saved));
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
        <DashboardShell user={user}>
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

  const [rawMessages, themes, stage2Count] = await Promise.all([
    getMessages(),
    getAvailableTopicThemes(),
    countStage2CatalogTasks(),
  ]);
  const messages = pickClientMessages(rawMessages, "/home");
  const interactiveAvailable = stage2Count > 0;

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      {needsCookieUpgrade ? <UpgradeSessionCookie /> : null}
      <DashboardShell
        user={user}
        cabinetScope={cabinetScope}
        marathonHref={marathonHref}
      >
        <SavedToast active={saved} text={savedText} />
        <TopicTestStart
          themes={themes}
          initialThemeId={initialThemeId}
          displayName={displayName}
          interactiveAvailable={interactiveAvailable}
        />
      </DashboardShell>
    </NextIntlClientProvider>
  );
}
