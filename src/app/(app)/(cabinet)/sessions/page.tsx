import { LearningSessionsTable } from "@/components/dashboard/LearningSessionsTable";
import { TeacherClassSessions } from "@/components/dashboard/TeacherClassSessions";
import {
  ALL_STUDENTS_VALUE,
  TeacherStudentResultsPicker,
} from "@/components/dashboard/TeacherStudentResultsPicker";
import { getNavItem } from "@/constants/navigation";
import { createPageMetadata } from "@/constants/seo";
import {
  canManageStudents,
  type AuthUser,
} from "@/modules/auth/types";
import { requireUser } from "@/modules/auth/getCurrentUser";
import { compareByWorstScore } from "@/modules/results/teacherStudentResults";
import { getLearningSessions } from "@/modules/sessions/getLearningSessions";
import {
  averageCompletedPercent,
  getTeacherLearningSessions,
} from "@/modules/sessions/teacherLearningSessions";
import { getTeacherStudents } from "@/modules/teacher-students";
import { parseTablePage } from "@/lib/pagination";
import { isQueryFlagOn, readSearchParam } from "@/lib/queryHref";
import { getTranslations } from "next-intl/server";

const item = getNavItem("/sessions");

export const metadata = createPageMetadata({
  title: item.label,
  description: item.description,
  path: item.href,
});

type SessionsPageProps = {
  searchParams: Promise<{
    extended?: string | string[];
    student?: string | string[];
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

async function TeacherSessions({
  user,
  studentParam,
  page,
}: {
  user: AuthUser;
  studentParam: "all" | number;
  page: number;
}) {
  const t = await getTranslations("TeacherStudentSessions");
  const roster = await getTeacherStudents(user.id).catch(() => []);

  if (roster.length === 0) {
    return <p>{t("noStudents")}</p>;
  }

  const refs = roster.map((row) => ({
    studentUserId: row.studentUserId,
    login: row.login,
    displayName: row.displayName,
  }));

  const [classSample, scopedRows] = await Promise.all([
    getTeacherLearningSessions(refs, { limit: 100 }),
    studentParam === "all"
      ? Promise.resolve(null)
      : getTeacherLearningSessions(refs, {
          studentUserId: studentParam,
          limit: 50,
        }),
  ]);

  const rows = scopedRows ?? classSample;
  const averages = averageCompletedPercent(classSample);

  const pickerStudents = refs
    .map((student) => ({
      ...student,
      overallAverage: averages.get(student.studentUserId) ?? null,
    }))
    .sort(
      (a, b) =>
        compareByWorstScore(a.overallAverage, b.overallAverage) ||
        a.displayName.localeCompare(b.displayName, "uk"),
    );

  if (studentParam === "all") {
    return (
      <>
        <TeacherStudentResultsPicker
          students={pickerStudents}
          selectedValue={ALL_STUDENTS_VALUE}
          basePath="/sessions"
        />
        <TeacherClassSessions
          rows={rows}
          page={page}
          paginationQueryParams={{ student: ALL_STUDENTS_VALUE }}
        />
      </>
    );
  }

  const student = refs.find((item) => item.studentUserId === studentParam);
  if (!student) {
    return (
      <>
        <TeacherStudentResultsPicker
          students={pickerStudents}
          selectedValue={ALL_STUDENTS_VALUE}
          basePath="/sessions"
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
        basePath="/sessions"
      />
      <TeacherClassSessions
        rows={rows}
        showStudent={false}
        title={t("studentTitle", { name: student.displayName })}
        lead={t("studentLead")}
        empty={t("studentEmpty")}
        page={page}
        paginationQueryParams={{ student: String(studentParam) }}
      />
    </>
  );
}

export default async function SessionsPage({ searchParams }: SessionsPageProps) {
  const user = await requireUser();
  const params = await searchParams;
  const studentParam = readStudentParam(params.student);
  const extendedRaw = readSearchParam(params.extended);
  const page = readPageParam(params.page);

  if (canManageStudents(user.role)) {
    return (
      <TeacherSessions user={user} studentParam={studentParam} page={page} />
    );
  }

  const extended = isQueryFlagOn(extendedRaw);
  const rows = await getLearningSessions(user.id);
  return (
    <LearningSessionsTable
      rows={rows}
      extended={extended}
      page={page}
      queryParams={{ extended: extended ? "1" : null }}
    />
  );
}
