import "server-only";

import { getConnection } from "@/lib/db/mysql";
import { ensureMentorAssignmentsSchema } from "@/modules/mentor-assignments/schema";
import { ensureTeacherStudentsSchema } from "@/modules/teacher-students/schema";
import {
  getDiagnosticThemeBreakdown,
  selectPriorityTopics,
} from "@/modules/diagnostic/diagnosticThemeBreakdown";
import { isPerfectDiagnosticResult } from "@/modules/diagnostic/diagnosticResultState";
import { listDayAccess } from "@/modules/marathons/daily/calendar";
import {
  getDailyById,
  listDays,
  listProgress,
} from "@/modules/marathons/daily/store";
import {
  recommendFromSessionMistakes,
  type RecommendationTranslator,
} from "@/modules/recommendations";
import { formatPercent } from "@/modules/results/types";
import {
  buildLearningSessionRows,
  sessionPercent,
  SESSION_STATUS_COMPLETED,
  type TaskSessionRecord,
} from "@/modules/sessions/types";
import { nowUnixSec } from "@/modules/testing/sessionElapsed";
import { getSessionMistakeReview } from "@/modules/testing/getSessionMistakeReview";
import { getTranslations } from "next-intl/server";
import {
  pickOpenMarathonDay,
  pickTodayAdvice,
  pickTodayAssignments,
  type StudentTodayModel,
  type TodayDiagnostic,
  type TodayJoinOffer,
  type TodayMarathon,
} from "./pickStudentToday";

const RECENT_SESSIONS = 5;
/** Diagnostic attempts use `session_type = 5`. */
const SESSION_TYPE_DIAGNOSTIC = 5;

type AssignmentRow = TaskSessionRecord;

/**
 * What a student should see on `/`: open mentor assignments, the current
 * marathon day, and one tip from the latest finished session that had mistakes.
 */
export async function loadStudentToday(
  userId: number,
): Promise<StudentTodayModel> {
  await ensureMentorAssignmentsSchema(getConnection);
  await ensureTeacherStudentsSchema(getConnection);
  const nowSec = nowUnixSec();
  const connection = await getConnection();

  let assignmentRows: AssignmentRow[] = [];
  let recentIds: number[] = [];
  let marathonId: number | null = null;
  let linkedToTeacher = false;
  let join: TodayJoinOffer | null = null;
  let diagnosticRow: { id: number; right: number; total: number } | null = null;

  try {
    assignmentRows = await connection.query<AssignmentRow>(
      `SELECT
         ts.id,
         ts.theme_id,
         t.name AS theme_name,
         ts.tasks_number,
         ts.right_number,
         ts.time,
         ts.session_status,
         ts.session_type,
         ts.start_time,
         ts.expire_time,
         ma.available_at,
         ma.difficulty,
         ma.due_at
       FROM mentor_assignment_members mam
       INNER JOIN mentor_assignments ma
         ON ma.id = mam.assignment_id AND ma.status = 'active'
       INNER JOIN task_sessions ts
         ON ts.id = mam.session_id AND ts.user_id = mam.student_user_id
       INNER JOIN themes t ON t.id = ts.theme_id
       WHERE mam.student_user_id = ?
         AND ts.session_status <> ?
         AND ts.expire_time > ?
       ORDER BY ma.due_at ASC, ts.id ASC
       LIMIT 20`,
      [userId, SESSION_STATUS_COMPLETED, nowSec],
    );

    const recent = await connection.query<{ id: number }>(
      `SELECT id
       FROM task_sessions
       WHERE user_id = ? AND session_status = ?
       ORDER BY id DESC
       LIMIT ${RECENT_SESSIONS}`,
      [userId, SESSION_STATUS_COMPLETED],
    );
    recentIds = recent.map((row) => row.id);

    const joined = await connection.query<{ id: number }>(
      `SELECT m.id
       FROM marathon_participants p
       INNER JOIN marathons m ON m.id = p.marathon_id
       WHERE p.user_id = ? AND m.kind = 'daily' AND m.status = 'active'
       ORDER BY p.joined_at DESC
       LIMIT 1`,
      [userId],
    );
    marathonId = joined[0]?.id ?? null;

    const links = await connection.query<{ ok: number }>(
      `SELECT 1 AS ok
       FROM teacher_students
       WHERE student_user_id = ?
       LIMIT 1`,
      [userId],
    );
    linkedToTeacher = links.length > 0;

    if (marathonId == null) {
      const open = await connection.query<{ slug: string; title: string }>(
        `SELECT slug, title
         FROM marathons
         WHERE kind = 'daily' AND status = 'active'
         ORDER BY id DESC
         LIMIT 1`,
      );
      const offer = open[0];
      if (offer?.slug) {
        join = { slug: offer.slug, title: offer.title };
      }
    }

    const trials = await connection.query<{
      id: number;
      right_number: number;
      tasks_number: number;
    }>(
      `SELECT id, right_number, tasks_number
       FROM task_sessions
       WHERE user_id = ? AND session_type = ? AND session_status = ?
       ORDER BY id DESC
       LIMIT 1`,
      [userId, SESSION_TYPE_DIAGNOSTIC, SESSION_STATUS_COMPLETED],
    );
    const trial = trials[0];
    if (trial) {
      diagnosticRow = {
        id: trial.id,
        right: Number(trial.right_number),
        total: Number(trial.tasks_number),
      };
    }
  } finally {
    connection.release();
  }

  const picked = pickTodayAssignments(
    buildLearningSessionRows(assignmentRows, nowSec),
  );
  const marathon = marathonId
    ? await loadMarathonDay(marathonId, userId)
    : null;
  const advice = await loadAdvice(userId, recentIds);
  const diagnostic = await loadDiagnosticNote(userId, diagnosticRow);

  return {
    assignments: picked.items,
    assignmentsMore: picked.more,
    marathon,
    join,
    linkedToTeacher,
    advice,
    diagnostic,
  };
}

async function loadDiagnosticNote(
  userId: number,
  session: { id: number; right: number; total: number } | null,
): Promise<TodayDiagnostic> {
  if (!session || session.total <= 0) return { kind: "offer" };

  const perfect = isPerfectDiagnosticResult(session.right, session.total);
  const stats = perfect
    ? []
    : await getDiagnosticThemeBreakdown(session.id, {
        userId,
        guestToken: null,
      });
  const start = selectPriorityTopics(stats)[0] ?? null;

  return {
    kind: "result",
    right: session.right,
    total: session.total,
    percentLabel: formatPercent(sessionPercent(session.total, session.right)),
    themeName: start?.themeName ?? null,
    themeHref: start ? `/topic?theme=${start.themeId}` : null,
    perfect,
  };
}

async function loadMarathonDay(
  marathonId: number,
  userId: number,
): Promise<TodayMarathon | null> {
  const marathon = await getDailyById(marathonId);
  if (!marathon || marathon.status !== "active") return null;

  const [days, progress] = await Promise.all([
    listDays(marathon.id),
    listProgress(marathon.id, userId),
  ]);
  const completed = new Set(
    progress.filter((row) => row.completedAt != null).map((row) => row.dayNumber),
  );
  const access = listDayAccess({
    now: new Date(),
    startDate: marathon.startDate,
    unlockHour: marathon.unlockHour,
    daysCount: marathon.daysCount,
  });

  return pickOpenMarathonDay({
    slug: marathon.slug,
    title: marathon.title,
    days: access.map((item) => {
      const content = days.find((day) => day.dayNumber === item.dayNumber);
      return {
        dayNumber: item.dayNumber,
        topic: content?.topic ?? "",
        open: item.open && Boolean(content),
        completed: completed.has(item.dayNumber),
      };
    }),
  });
}

async function loadAdvice(userId: number, sessionIds: number[]) {
  const t = (await getTranslations("Recommendations")) as RecommendationTranslator;
  for (const sessionId of sessionIds) {
    const mistakes = await getSessionMistakeReview(sessionId, userId);
    const advice = pickTodayAdvice(recommendFromSessionMistakes(mistakes, t));
    if (advice) return advice;
  }
  return null;
}
