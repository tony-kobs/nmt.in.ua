import { getTranslations } from "next-intl/server";
import { StudentGroupsPanel } from "@/components/dashboard/StudentGroupsPanel";
import { TeacherStudentsPanel } from "@/components/dashboard/TeacherStudentsPanel";
import { PageFrame } from "@/components/dashboard/PageFrame";
import { getNavItem } from "@/constants/navigation";
import { createPageMetadata } from "@/constants/seo";
import { absoluteSiteUrl } from "@/lib/siteOrigin";
import { requireRole } from "@/modules/auth/getCurrentUser";
import { inviteJoinPath } from "@/modules/teacher-students/codes";
import { getStudentGroups } from "@/modules/teacher-students/groups";
import { getActiveStudentInvites } from "@/modules/teacher-students/invites";
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
  let groups: Awaited<ReturnType<typeof getStudentGroups>> = [];
  let invites: Awaited<ReturnType<typeof getActiveStudentInvites>> = [];
  try {
    students = await getTeacherStudents(user.id);
  } catch (error) {
    console.error("students: getTeacherStudents failed", error);
  }
  try {
    groups = await getStudentGroups(user.id);
  } catch (error) {
    console.error("students: getStudentGroups failed", error);
  }
  try {
    invites = await getActiveStudentInvites(user.id);
  } catch (error) {
    console.error("students: getActiveStudentInvites failed", error);
  }

  const inviteViews = invites.map((invite) => ({
    kind: invite.kind,
    groupId: invite.groupId,
    code: invite.code,
    url: absoluteSiteUrl(inviteJoinPath(invite.code)),
    expiresAt: invite.expiresAt.toISOString(),
  }));

  return (
    <PageFrame kicker={t("kicker")} title={t("title")} lead={t("lead")}>
      <StudentGroupsPanel
        groups={groups.map((group) => ({
          id: group.id,
          name: group.name,
          memberCount: group.memberCount,
        }))}
        invites={inviteViews}
      />
      <TeacherStudentsPanel
        groups={groups.map((group) => ({ id: group.id, name: group.name }))}
        students={students.map((row) => ({
          studentUserId: row.studentUserId,
          login: row.login,
          displayName: row.displayName,
          groupId: row.groupId,
          groupName: row.groupName,
        }))}
      />
    </PageFrame>
  );
}
