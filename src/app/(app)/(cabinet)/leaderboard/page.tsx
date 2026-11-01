import { redirect } from "next/navigation";
import { MarathonLeaderboardView } from "@/components/marathons/MarathonLeaderboardView";
import { PageFrame, PagePanel } from "@/components/dashboard/PageFrame";
import { getNavItem } from "@/constants/navigation";
import { createPageMetadata } from "@/constants/seo";
import { requireUser } from "@/modules/auth/getCurrentUser";
import { canManageStudents } from "@/modules/auth/types";
import { getMarathonLeaderboard } from "@/modules/marathons";
import { getTeacherStudents } from "@/modules/teacher-students";
import { readSearchParam } from "@/lib/queryHref";
import { getTranslations } from "next-intl/server";

const item = getNavItem("/leaderboard");

type PageProps = {
  searchParams: Promise<{ marathon?: string | string[] }>;
};

export const metadata = createPageMetadata({
  title: item.label,
  description: item.description,
  path: item.href,
});

export default async function LeaderboardPage({ searchParams }: PageProps) {
  const user = await requireUser();
  const marathonSlug = readSearchParam((await searchParams).marathon);
  if (user.role === "student") {
    redirect(
      marathonSlug
        ? `/marathon?marathon=${encodeURIComponent(marathonSlug)}`
        : "/marathon",
    );
  }
  const t = await getTranslations("MarathonLeaderboard");

  let rosterStudentIds: Set<number> | undefined;
  if (canManageStudents(user.role)) {
    const roster = await getTeacherStudents(user.id).catch(() => []);
    rosterStudentIds = new Set(roster.map((row) => row.studentUserId));
  }

  const data = await getMarathonLeaderboard(user.id, {
    rosterStudentIds,
    marathonSlug,
  });

  if (!data) {
    return (
      <PageFrame title={t("title")} lead={t("lead")}>
        <PagePanel>
          <p role="status">{t("noActiveMarathon")}</p>
        </PagePanel>
      </PageFrame>
    );
  }

  const mode =
    user.role === "admin"
      ? "admin"
      : user.role === "teacher"
        ? "teacher"
        : "student";

  const lead =
    mode === "admin"
      ? t("leadAdmin")
      : mode === "teacher"
        ? t("leadTeacher")
        : t("lead");

  return (
    <PageFrame title={t("title")} lead={lead} kicker={t("kicker")}>
      <PagePanel>
        <MarathonLeaderboardView data={data} mode={mode} />
      </PagePanel>
    </PageFrame>
  );
}
