import { getTranslations } from "next-intl/server";
import { TeacherSessionEditor } from "@/components/dashboard/TeacherSessionEditor";
import { PageFrame } from "@/components/dashboard/PageFrame";
import { createPageMetadata } from "@/constants/seo";
import { requireRole } from "@/modules/auth/getCurrentUser";
import { getAvailableTopicThemes } from "@/modules/testing/getAvailableTopicThemes";

export async function generateMetadata() {
  const t = await getTranslations("Metadata.teacherSession");
  return createPageMetadata({
    title: t("title"),
    description: t("description"),
    path: "/assign/sessions/new",
    noIndex: true,
  });
}

export default async function NewTeacherSessionPage() {
  await requireRole(["teacher", "admin"]);
  const t = await getTranslations("TeacherSessions");
  const themes = await getAvailableTopicThemes();

  return (
    <PageFrame kicker={t("kicker")} title={t("newTitle")} lead={t("lead")}>
      <TeacherSessionEditor themes={themes} session={null} />
    </PageFrame>
  );
}
