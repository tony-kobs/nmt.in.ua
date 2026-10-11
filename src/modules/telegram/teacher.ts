import "server-only";
import type { SqlConnection } from "@/lib/db/mysql";
import { resolveMemberProgress } from "@/modules/mentor-assignments/types";
import { sessionPercent } from "@/modules/sessions/types";
import type { InlineKeyboard } from "./taskInteraction";
import { cleanTitle, formatKyivDateTime, html, MENU, menuButton, siteButton } from "./ui";

export const TELEGRAM_TEACHER_RESULT_NOTIFICATION = "teacher_result";
export const TEACHER_RESULTS_BATCH = 20;
export const TEACHER_SUMMARY_LIMIT = 10;

/** Same rule as `resolveMemberProgress` → "completed"; kept in SQL so selection stays index-bounded. */
const COMPLETED_SQL = "(ts.session_status = 1 OR (ts.tasks_number > 0 AND ts.right_number >= ts.tasks_number AND ts.time > 0))";

/**
 * Every teacher read joins the assignment owner, the current roster link and the member's own session,
 * so an unlinked student, a foreign assignment or a cancelled one never reaches the teacher.
 */
const SCOPED_RESULTS_FROM = `
  FROM mentor_assignments ma
  INNER JOIN mentor_assignment_members mam ON mam.assignment_id = ma.id
  INNER JOIN task_sessions ts ON ts.id = mam.session_id AND ts.user_id = mam.student_user_id
  INNER JOIN teacher_students tst ON tst.teacher_user_id = ma.teacher_user_id AND tst.student_user_id = mam.student_user_id
  INNER JOIN app_users su ON su.id = mam.student_user_id AND su.is_banned = 0
  LEFT JOIN themes t ON t.id = ts.theme_id`;

export type TeacherResult = {
  sessionId: number;
  studentUserId: number;
  studentName: string;
  topic: string;
  tasksNumber: number;
  rightNumber: number;
};

type ResultRow = {
  session_id: number; student_id: number; display_name: string | null; theme_name: string | null;
  session_status: number; tasks_number: number; right_number: number; time: number;
};

function toResult(row: ResultRow): TeacherResult | null {
  const progress = resolveMemberProgress({
    session_status: Number(row.session_status),
    tasks_number: Number(row.tasks_number),
    right_number: Number(row.right_number),
    time: Number(row.time),
  }, Number.MAX_SAFE_INTEGER, 0);
  if (progress !== "completed") return null;
  return {
    sessionId: Number(row.session_id),
    studentUserId: Number(row.student_id),
    studentName: cleanTitle(row.display_name, "Учень"),
    topic: cleanTitle(row.theme_name, "Навчальна сесія"),
    tasksNumber: Number(row.tasks_number),
    rightNumber: Number(row.right_number),
  };
}

const RESULT_COLUMNS = `ts.id AS session_id, ts.user_id AS student_id, su.display_name, t.name AS theme_name,
  ts.session_status, ts.tasks_number, ts.right_number, ts.time`;

/** Completed assigned sessions this teacher account has not been told about yet. */
export async function listPendingTeacherResults(connection: SqlConnection, accountId: number, teacherUserId: number): Promise<TeacherResult[]> {
  const rows = await connection.query<ResultRow>(`SELECT ${RESULT_COLUMNS}
    ${SCOPED_RESULTS_FROM}
    LEFT JOIN telegram_task_notifications n ON n.account_id = ? AND n.session_id = ts.id AND n.notification_type = ?
    WHERE ma.teacher_user_id = ? AND ma.status = 'active' AND ${COMPLETED_SQL}
      AND (n.account_id IS NULL OR n.delivery_state = 'ready')
    ORDER BY ts.id
    LIMIT ${TEACHER_RESULTS_BATCH}`, [accountId, TELEGRAM_TEACHER_RESULT_NOTIFICATION, teacherUserId]);
  return rows.map(toResult).filter((row): row is TeacherResult => row !== null);
}

/** Re-reads one result under row locks right before sending; null when access or completion no longer holds. */
export async function lockTeacherResult(connection: SqlConnection, teacherUserId: number, sessionId: number): Promise<TeacherResult | null> {
  const rows = await connection.query<ResultRow>(`SELECT ${RESULT_COLUMNS}
    ${SCOPED_RESULTS_FROM}
    WHERE ma.teacher_user_id = ? AND ma.status = 'active' AND ts.id = ? AND ${COMPLETED_SQL}
    LIMIT 1 FOR UPDATE`, [teacherUserId, sessionId]);
  return rows[0] ? toResult(rows[0]) : null;
}

/**
 * Marks every result that is already complete as seen, so enabling teacher notifications (or linking
 * Telegram) never floods the chat with history. Rows get `delivered` without a message id.
 */
export async function baselineTeacherResults(connection: SqlConnection, accountId: number, teacherUserId: number): Promise<void> {
  await connection.beginTransaction();
  try {
    await connection.execute(`INSERT INTO telegram_task_notifications (account_id, session_id, notification_type, delivery_state)
      SELECT ?, ts.id, ?, 'delivered'
      FROM mentor_assignments ma
      INNER JOIN mentor_assignment_members mam ON mam.assignment_id = ma.id
      INNER JOIN task_sessions ts ON ts.id = mam.session_id AND ts.user_id = mam.student_user_id
      WHERE ma.teacher_user_id = ? AND ${COMPLETED_SQL}
      ON DUPLICATE KEY UPDATE delivery_state = IF(delivery_state = 'ready', 'delivered', delivery_state)`,
    [accountId, TELEGRAM_TEACHER_RESULT_NOTIFICATION, teacherUserId]);
    await connection.execute(`INSERT INTO telegram_notification_preferences (account_id, teacher_baseline_at) VALUES (?, CURRENT_TIMESTAMP)
      ON DUPLICATE KEY UPDATE teacher_baseline_at = CURRENT_TIMESTAMP`, [accountId]);
    await connection.commit();
  } catch (error) {
    await connection.rollback().catch(() => undefined);
    throw error;
  }
}

export function formatTeacherResult(result: TeacherResult): { text: string; replyMarkup: InlineKeyboard } {
  const percent = sessionPercent(result.tasksNumber, result.rightNumber);
  const score = result.tasksNumber > 0
    ? `${result.rightNumber}/${result.tasksNumber}${percent === null ? "" : ` (${Math.round(percent)}%)`}`
    : "—";
  return {
    text: `✅ <b>Учень завершив завдання</b>\n\n👤 ${html(result.studentName)}\n📘 ${html(result.topic)}\nРезультат: <b>${score}</b>`,
    replyMarkup: { inline_keyboard: [
      [siteButton("👤 Відкрити учня", `/students/${result.studentUserId}`)],
      [menuButton()],
    ] },
  };
}

export type TeacherAssignmentSummary = { topic: string; dueAt: number; members: number; completed: number };

/** Active assignments that are open now or were due within the last day, with roster-scoped completion counts. */
export async function getTeacherAssignmentSummary(connection: SqlConnection, teacherUserId: number, nowSec: number): Promise<TeacherAssignmentSummary[]> {
  const rows = await connection.query<{ theme_name: string | null; due_at: number; members: number | string; completed: number | string | null }>(`
    SELECT t.name AS theme_name, ma.due_at, COUNT(mam.id) AS members,
      SUM(CASE WHEN ts.id IS NOT NULL AND ${COMPLETED_SQL} THEN 1 ELSE 0 END) AS completed
    FROM mentor_assignments ma
    INNER JOIN mentor_assignment_members mam ON mam.assignment_id = ma.id
    INNER JOIN teacher_students tst ON tst.teacher_user_id = ma.teacher_user_id AND tst.student_user_id = mam.student_user_id
    LEFT JOIN task_sessions ts ON ts.id = mam.session_id AND ts.user_id = mam.student_user_id
    LEFT JOIN themes t ON t.id = ma.theme_id
    WHERE ma.teacher_user_id = ? AND ma.status = 'active' AND ma.available_at <= ? AND ma.due_at > ?
    GROUP BY ma.id, t.name, ma.due_at
    ORDER BY ma.due_at ASC, ma.id ASC
    LIMIT ${TEACHER_SUMMARY_LIMIT}`, [teacherUserId, nowSec, nowSec - 86400]);
  return rows.map((row) => ({
    topic: cleanTitle(row.theme_name, "Тема"),
    dueAt: Number(row.due_at),
    members: Number(row.members) || 0,
    completed: Number(row.completed) || 0,
  }));
}

export function formatTeacherSummary(items: TeacherAssignmentSummary[], nowSec: number, title: string): string {
  if (!items.length) return `<b>${title}</b>\n\nАктивних завдань для учнів зараз немає.`;
  const lines = [`<b>${title}</b>`, ""];
  for (const item of items) {
    const overdue = item.dueAt <= nowSec;
    const pending = item.members - item.completed;
    lines.push(`📘 <b>${html(item.topic)}</b>`);
    lines.push(`Завершили: ${item.completed}/${item.members}` + (pending > 0 && overdue ? ` · ⚠️ не встигли: ${pending}` : ""));
    lines.push(overdue ? `Термін минув: ${formatKyivDateTime(item.dueAt)}` : `⏰ Термін: ${formatKyivDateTime(item.dueAt)}`);
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}

export function teacherSummaryKeyboard(): InlineKeyboard {
  return { inline_keyboard: [[siteButton("👥 Учні на сайті", "/students")], [{ text: "🔔 Сповіщення", callback_data: MENU.notifications }, menuButton()]] };
}
