import { getTranslations } from "next-intl/server";
import { TeacherStudentsPanel } from "@/components/dashboard/TeacherStudentsPanel";
import { PageFrame } from "@/components/dashboard/PageFrame";
import { getNavItem } from "@/constants/navigation";
import { createPageMetadata } from "@/constants/seo";
import { requireRole } from "@/modules/auth/getCurrentUser";
import { getTeacherStudents } from "@/modules/teacher-students/getTeacherStudents";

const item = getNavItem("/students");

export async function generateMetadata() {
  const t = await getTranslations("Metadata.students");

  return createPageMetadata({
    title: t("title"),
    description: t("description"),
    path: item.href,
  });
}

export default async function StudentsPage() {
  const user = await requireRole(["teacher", "admin"]);
  const t = await getTranslations("TeacherStudents");

  let students: Awaited<ReturnType<typeof getTeacherStudents>> = [];
  try {
    students = await getTeacherStudents(user.id);
  } catch (error) {
    console.error("students: getTeacherStudents failed", error);
  }

  return (
    <PageFrame kicker={t("kicker")} title={t("title")} lead={t("lead")}>
      <TeacherStudentsPanel
        students={students.map((row) => ({
          studentUserId: row.studentUserId,
          login: row.login,
          displayName: row.displayName,
        }))}
      />
    </PageFrame>
  );
}
