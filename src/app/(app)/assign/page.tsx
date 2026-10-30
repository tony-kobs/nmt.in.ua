import { getTranslations } from "next-intl/server";
import { TeacherAssignWorkspace } from "@/components/dashboard/TeacherAssignWorkspace";
import { PageFrame } from "@/components/dashboard/PageFrame";
import { getNavItem } from "@/constants/navigation";
import { createPageMetadata } from "@/constants/seo";
import { requireRole } from "@/modules/auth/getCurrentUser";
import {
  getMentorAssignmentDetail,
  listMentorAssignments,
} from "@/modules/mentor-assignments";
import { listTeacherSessions } from "@/modules/teacher-sessions";
import { getTeacherStudents } from "@/modules/teacher-students/getTeacherStudents";
import { getAvailableTopicThemes } from "@/modules/testing/getAvailableTopicThemes";
import type { MentorAssignmentDetail } from "@/modules/mentor-assignments";

const item = getNavItem("/assign");

export async function generateMetadata() {
  const t = await getTranslations("Metadata.assign");
  return createPageMetadata({
    title: t("title"),
    description: t("description"),
    path: item.href,
  });
}

export default async function AssignPage() {
  const user = await requireRole(["teacher", "admin"]);
  const t = await getTranslations("TeacherAssign");

  const [themes, students, assignments, sessions] = await Promise.all([
    getAvailableTopicThemes(),
    getTeacherStudents(user.id).catch((error) => {
      console.error("assign: getTeacherStudents failed", error);
      return [];
    }),
    listMentorAssignments(user.id).catch((error) => {
      console.error("assign: listMentorAssignments failed", error);
      return [];
    }),
    listTeacherSessions(user.id).catch((error) => {
      console.error("assign: listTeacherSessions failed", error);
      return [];
    }),
  ]);

  const detailsById: Record<number, MentorAssignmentDetail> = {};
  await Promise.all(
    assignments.map(async (row) => {
      try {
        detailsById[row.id] = await getMentorAssignmentDetail(row.id, user.id);
      } catch (error) {
        console.error("assign: getMentorAssignmentDetail failed", error);
      }
    }),
  );

  return (
    <PageFrame kicker={t("kicker")} title={t("title")} lead={t("lead")}>
      <TeacherAssignWorkspace
        themes={themes}
        students={students.map((row) => ({
          studentUserId: row.studentUserId,
          login: row.login,
          displayName: row.displayName,
        }))}
        assignments={assignments}
        sessions={sessions}
        detailsById={detailsById}
      />
    </PageFrame>
  );
}
