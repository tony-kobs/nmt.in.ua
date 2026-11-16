import { getTranslations } from "next-intl/server";
import { AccountCabinet } from "@/components/account/AccountCabinet";
import { PageFrame } from "@/components/dashboard/PageFrame";
import { createPageMetadata } from "@/constants/seo";
import { requireUser } from "@/modules/auth/getCurrentUser";
import { isPlatformStaff } from "@/modules/auth/types";
import { defaultChannelPreferences } from "@/modules/notifications/channels";
import { getUserChannelPreferences } from "@/modules/notifications/channelStore";
import { getTelegramLink } from "@/modules/telegram/link";
import { getRecentResults } from "@/modules/results/getRecentResults";
import { listLinkedParents } from "@/modules/parent-students/unlinkParent";
import {
  canEditTeacherProfile,
  getOwnTeacherProfile,
} from "@/modules/teachers";
import { getStudentAccess } from "@/modules/promo/store";

export async function generateMetadata() {
  const t = await getTranslations("Metadata.account");

  return createPageMetadata({
    title: t("title"),
    description: t("description"),
    path: "/account",
    noIndex: true,
  });
}

export default async function AccountPage() {
  const user = await requireUser();
  const t = await getTranslations("AccountCabinet");

  let recentResults: Awaited<ReturnType<typeof getRecentResults>> = [];
  if (!isPlatformStaff(user.role)) {
    try {
      recentResults = await getRecentResults(user.id);
    } catch (error) {
      console.error("account: getRecentResults failed", error);
    }
  }

  let teacherProfile = null;
  if (canEditTeacherProfile(user.role)) {
    try {
      teacherProfile = await getOwnTeacherProfile(user.id);
    } catch (error) {
      console.error("account: getOwnTeacherProfile failed", error);
    }
  }

  let telegramLinked = false;
  let telegramUsername: string | null = null;
  try {
    const link = await getTelegramLink(user.id);
    telegramLinked = link.linked;
    telegramUsername = link.username;
  } catch (error) {
    console.error("account: getTelegramLink failed", error);
  }

  let notificationPreferences = defaultChannelPreferences();
  try {
    notificationPreferences = await getUserChannelPreferences(user.id);
  } catch (error) {
    console.error("account: getUserChannelPreferences failed", error);
  }

  let promoAccessUntil: string | null = null;
  let promoTeachers: string[] = [];
  let linkedParents: Awaited<ReturnType<typeof listLinkedParents>> = [];
  if (user.role === "student" && (user.realRole ?? user.role) === "student") {
    try {
      const access = await getStudentAccess(user.id);
      promoAccessUntil = access.accessUntil;
      promoTeachers = access.teachers;
    } catch (error) {
      console.error("account: getStudentAccess failed", error);
    }
    try {
      linkedParents = await listLinkedParents();
    } catch (error) {
      console.error("account: listLinkedParents failed", error);
    }
  }

  return (
    <PageFrame
      kicker={t("kicker")}
      title={t("title")}
      lead={isPlatformStaff(user.role) ? t("leadAdmin") : t("lead")}
    >
      <AccountCabinet
        user={user}
        recentResults={recentResults}
        teacherProfile={teacherProfile}
        telegramLinked={telegramLinked}
        telegramUsername={telegramUsername}
        notificationPreferences={notificationPreferences}
        linkedParents={linkedParents}
        promoAccessUntil={promoAccessUntil}
        promoTeachers={promoTeachers}
      />
    </PageFrame>
  );
}
