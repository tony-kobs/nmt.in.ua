import { PostTestFeedbackPrompt } from "@/components/feedback/FeedbackDialog";
import { RecommendedActionsPanel } from "@/components/dashboard/RecommendedActionsPanel";
import {
  TeacherClassTopicTable,
  TeacherThemeStudentsPanel,
} from "@/components/dashboard/TeacherClassResults";
import {
  ALL_STUDENTS_VALUE,
  TeacherStudentResultsPicker,
} from "@/components/dashboard/TeacherStudentResultsPicker";
import { TopicResultsTable } from "@/components/dashboard/TopicResultsTable";
import { getNavItem } from "@/constants/navigation";
import { createPageMetadata } from "@/constants/seo";
import {
  canManageStudents,
  type AuthUser,
} from "@/modules/auth/types";
import { requireUser } from "@/modules/auth/getCurrentUser";
import { getStudentTopicStats } from "@/modules/recommendations/getStudentTopicStats";
import { recommendNextActionsForStats } from "@/modules/recommendations";
import { getTopicResults } from "@/modules/results/getTopicResults";
import {
  buildClassTopicRows,
  buildThemeStudentAverages,
  loadStudentTopicBundles,
} from "@/modules/results/teacherStudentResults";
import { getTeacherStudents } from "@/modules/teacher-students";
import { parseTablePage } from "@/lib/pagination";
import { getTranslations } from "next-intl/server";

const item = getNavItem("/results");

export const metadata = createPageMetadata({
  title: item.label,
  description: item.description,
  path: item.href,
});

type ResultsPageProps = {
  searchParams: Promise<{
    sessionId?: string | string[];
    student?: string | string[];
    theme?: string | string[];
    page?: string | string[];
  }>;
};

function readPageParam(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return parseTablePage(value);
}

function readPositiveInt(
  raw: string | string[] | undefined,
): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

function readStudentParam(
  raw: string | string[] | undefined,
): "all" | number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value == null || value === "" || value === ALL_STUDENTS_VALUE) {
    return "all";
  }
  return readPositiveInt(value) ?? "all";
}

async function StudentOwnResults({
  userId,
  finishedSessionId,
  page,
}: {
  userId: number;
  finishedSessionId: number | null;
  page: number;
}) {
  const t = await getTranslations("Recommendations");
  const [rows, topicStats] = await Promise.all([
    getTopicResults(userId),
    getStudentTopicStats(userId),
  ]);
  const actions = await recommendNextActionsForStats(topicStats, t);

  return (
    <>
      <TopicResultsTable
        rows={rows}
        page={page}
        queryParams={
          finishedSessionId
            ? { sessionId: String(finishedSessionId) }
            : undefined
        }
      />
      <RecommendedActionsPanel actions={actions} />
      {finishedSessionId ? (
        <PostTestFeedbackPrompt sessionId={finishedSessionId} />
      ) : null}
    </>
  );
}

async function TeacherStudentResults({
  user,
  studentParam,
  themeId,
  page,
}: {
  user: AuthUser;
  studentParam: "all" | number;
  themeId: number | null;
  page: number;
}) {
  const t = await getTranslations("TeacherStudentResults");
  const roster = await getTeacherStudents(user.id).catch(() => []);
  const bundles = await loadStudentTopicBundles(
    roster.map((row) => ({
      studentUserId: row.studentUserId,
      login: row.login,
      displayName: row.displayName,
    })),
  );

  const pickerStudents = bundles.map((bundle) => ({
    studentUserId: bundle.student.studentUserId,
    login: bundle.student.login,
    displayName: bundle.student.displayName,
    overallAverage: bundle.overallAverage,
  }));

  if (roster.length === 0) {
    return <p>{t("noStudents")}</p>;
  }

  if (studentParam === "all") {
    const classRows = buildClassTopicRows(bundles);
    const selectedTheme =
      themeId != null
        ? classRows.find((row) => row.themeId === themeId)
        : null;
    const themeStudents =
      selectedTheme != null
        ? buildThemeStudentAverages(bundles, selectedTheme.themeId)
        : [];

    return (
      <>
        <TeacherStudentResultsPicker
          students={pickerStudents}
          selectedValue={ALL_STUDENTS_VALUE}
        />
        <TeacherClassTopicTable
          rows={classRows}
          selectedThemeId={selectedTheme?.themeId ?? null}
          page={page}
          queryParams={{
            student: ALL_STUDENTS_VALUE,
            theme: themeId ? String(themeId) : null,
          }}
        />
        {selectedTheme ? (
          <TeacherThemeStudentsPanel
            themeName={selectedTheme.themeName}
            students={themeStudents}
          />
        ) : null}
      </>
    );
  }

  const bundle = bundles.find(
    (item) => item.student.studentUserId === studentParam,
  );
  if (!bundle) {
    return (
      <>
        <TeacherStudentResultsPicker
          students={pickerStudents}
          selectedValue={ALL_STUDENTS_VALUE}
        />
        <p>{t("forbidden")}</p>
      </>
    );
  }

  return (
    <>
      <TeacherStudentResultsPicker
        students={pickerStudents}
        selectedValue={String(studentParam)}
      />
      <TopicResultsTable
        rows={bundle.rows}
        readOnly
        hideEmptyThemes
        title={t("title", { name: bundle.student.displayName })}
        lead={t("lead")}
        page={page}
        queryParams={{ student: String(studentParam) }}
      />
    </>
  );
}

export default async function ResultsPage({ searchParams }: ResultsPageProps) {
  const user = await requireUser();
  const params = await searchParams;
  const finishedSessionId = readPositiveInt(params.sessionId);
  const studentParam = readStudentParam(params.student);
  const themeId = readPositiveInt(params.theme);
  const page = readPageParam(params.page);

  if (canManageStudents(user.role)) {
    return (
      <TeacherStudentResults
        user={user}
        studentParam={studentParam}
        themeId={themeId}
        page={page}
      />
    );
  }

  return (
    <StudentOwnResults
      userId={user.id}
      finishedSessionId={finishedSessionId}
      page={page}
    />
  );
}
