import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { TeacherSessionEditor } from "@/components/dashboard/TeacherSessionEditor";
import { PageFrame } from "@/components/dashboard/PageFrame";
import { createPageMetadata } from "@/constants/seo";
import { requireRole } from "@/modules/auth/getCurrentUser";
import { TeacherSessionsError, getTeacherSession } from "@/modules/teacher-sessions";
import { getAvailableTopicThemes } from "@/modules/testing/getAvailableTopicThemes";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata() {
  const t = await getTranslations("Metadata.teacherSession");
  return createPageMetadata({
    title: t("title"),
    description: t("description"),
    path: "/assign",
    noIndex: true,
  });
}

export default async function EditTeacherSessionPage({ params }: PageProps) {
  const user = await requireRole(["teacher", "admin"]);
  const { id: raw } = await params;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const t = await getTranslations("TeacherSessions");
  let session;
  try {
    session = await getTeacherSession(id, user.id);
  } catch (error) {
    if (
      error instanceof TeacherSessionsError &&
      (error.code === "not_found" || error.code === "forbidden")
    ) {
      notFound();
    }
    throw error;
  }

  const themes = await getAvailableTopicThemes();

  return (
    <PageFrame kicker={t("kicker")} title={session.title} lead={t("lead")}>
      <TeacherSessionEditor themes={themes} session={session} />
    </PageFrame>
  );
}
