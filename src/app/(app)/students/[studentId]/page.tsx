import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { TeacherStudentDetail } from "@/components/dashboard/TeacherStudentDetail";
import { PageFrame } from "@/components/dashboard/PageFrame";
import { createPageMetadata } from "@/constants/seo";
import { requireRole } from "@/modules/auth/getCurrentUser";
import { TEACHING_STAFF_ROLES } from "@/modules/auth/types";
import { getTopicResults } from "@/modules/results/getTopicResults";
import { getTeacherLearningSessions } from "@/modules/sessions/teacherLearningSessions";
import { getTeacherStudents } from "@/modules/teacher-students/getTeacherStudents";

type StudentStatsPageProps = {
  params: Promise<{ studentId: string }>;
};

function readStudentId(raw: string): number | null {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

export async function generateMetadata() {
  const t = await getTranslations("Metadata.studentStats");

  return createPageMetadata({
    title: t("title"),
    description: t("description"),
    path: "/students",
    noIndex: true,
  });
}

export default async function StudentStatsPage({
  params,
}: StudentStatsPageProps) {
  const user = await requireRole(TEACHING_STAFF_ROLES);
  const { studentId: rawId } = await params;
  const studentId = readStudentId(rawId);
  if (studentId == null) notFound();

  const t = await getTranslations("TeacherStudents");
  const roster = await getTeacherStudents(user.id).catch(() => []);
  const student = roster.find((row) => row.studentUserId === studentId);

  if (!student) {
    return (
      <PageFrame kicker={t("kicker")} title={t("title")} lead={t("notOnRoster")}>
        {null}
      </PageFrame>
    );
  }

  const [rows, sessions] = await Promise.all([
    getTopicResults(student.studentUserId).catch(() => []),
    getTeacherLearningSessions(
      [
        {
          studentUserId: student.studentUserId,
          login: student.login,
          displayName: student.displayName,
        },
      ],
      { studentUserId: student.studentUserId, limit: 50 },
    ).catch(() => []),
  ]);

  return (
    <PageFrame
      kicker={t("kicker")}
      title={student.displayName}
      lead={t("statsLead")}
    >
      <TeacherStudentDetail
        studentUserId={student.studentUserId}
        displayName={student.displayName}
        login={student.login}
        groupName={student.groupName}
        rows={rows}
        sessions={sessions}
      />
    </PageFrame>
  );
}
