import { LearningSessionsTable } from "@/components/dashboard/LearningSessionsTable";
import { MentorAssignPanel } from "@/components/dashboard/MentorAssignPanel";
import { getNavItem } from "@/constants/navigation";
import { createPageMetadata } from "@/constants/seo";
import { canAssignMentorSessions } from "@/modules/auth/types";
import { listStudents } from "@/modules/auth/users";
import { requireUser } from "@/modules/auth/getCurrentUser";
import { getAvailableTopicThemes } from "@/modules/testing/getAvailableTopicThemes";
import { getLearningSessions } from "@/modules/sessions/getLearningSessions";

const item = getNavItem("/sessions");

export const metadata = createPageMetadata({
  title: item.label,
  description: item.description,
  path: item.href,
});

export default async function SessionsPage() {
  const user = await requireUser();
  const [rows, themes, students] = await Promise.all([
    getLearningSessions(user.id),
    canAssignMentorSessions(user.role)
      ? getAvailableTopicThemes()
      : Promise.resolve([]),
    canAssignMentorSessions(user.role)
      ? listStudents()
      : Promise.resolve([]),
  ]);

  return (
    <>
      {canAssignMentorSessions(user.role) ? (
        <MentorAssignPanel
          themes={themes}
          students={students}
          defaultUserId={students[0]?.id ?? 1}
        />
      ) : null}
      <LearningSessionsTable rows={rows} />
    </>
  );
}
