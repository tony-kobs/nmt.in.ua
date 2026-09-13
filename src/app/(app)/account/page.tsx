import { getTranslations } from "next-intl/server";
import { AccountCabinet } from "@/components/account/AccountCabinet";
import { PageFrame } from "@/components/dashboard/PageFrame";
import { createPageMetadata } from "@/constants/seo";
import { isDemoAccountLogin } from "@/modules/auth/demoLogin";
import { requireUser } from "@/modules/auth/getCurrentUser";
import { getRecentResults } from "@/modules/results/getRecentResults";
import {
  canEditTeacherProfile,
  getOwnTeacherProfile,
} from "@/modules/teachers";

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
  try {
    recentResults = await getRecentResults(user.id);
  } catch (error) {
    console.error("account: getRecentResults failed", error);
  }

  let teacherProfile = null;
  if (canEditTeacherProfile(user.role)) {
    try {
      teacherProfile = await getOwnTeacherProfile(user.id);
    } catch (error) {
      console.error("account: getOwnTeacherProfile failed", error);
    }
  }

  return (
    <PageFrame kicker={t("kicker")} title={t("title")} lead={t("lead")}>
      <AccountCabinet
        user={user}
        recentResults={recentResults}
        demoLocked={isDemoAccountLogin(user.login)}
        teacherProfile={teacherProfile}
      />
    </PageFrame>
  );
}
