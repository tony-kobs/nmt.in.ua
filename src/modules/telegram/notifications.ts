import "server-only";
import type { SqlConnection } from "@/lib/db/mysql";
import { nowUnixSec } from "@/modules/testing/sessionElapsed";
import { readTelegramConfig } from "./config";
import { loadTelegramConnection } from "./schema";
import { getTelegramAvailableTaskSessions, type TelegramTaskSession } from "./tasks";
import { createTaskReference } from "./taskReference";
import {
  claimNotification, readNotificationState, recordNotificationResult,
  TELEGRAM_DEADLINE_NOTIFICATION, TELEGRAM_NEW_TASK_NOTIFICATION, type NotificationKey,
} from "./notificationDelivery";
import {
  claimDigest, DEFAULT_NOTIFICATION_PREFERENCES, ensureNotificationPreferences, isQuietHour,
  loadNotificationPreferences, releaseDigest, type NotificationPreferences,
} from "./preferences";
import {
  baselineTeacherResults, formatTeacherResult, formatTeacherSummary, getTeacherAssignmentSummary,
  listPendingTeacherResults, lockTeacherResult, teacherSummaryKeyboard, TELEGRAM_TEACHER_RESULT_NOTIFICATION,
} from "./teacher";
import { getKyivClock } from "./taskDay";
import type { InlineKeyboard, TelegramReply } from "./taskInteraction";
import { cleanTitle, effectiveDeadline, formatKyivDateTime, html, MENU } from "./ui";
import { sendTelegramMessage, type TelegramSendResult } from "./transport";

/** A deadline reminder goes out once the effective deadline is this close. */
export const DEADLINE_REMINDER_WINDOW_SEC = 6 * 60 * 60;
/**
 * Kyiv hours [start, end) for the once-a-day messages. The student reminder runs before the
 * marathon's 19:00 reminder and the teacher summary after it, so the two features never coincide.
 * A run that misses the window (scheduler outage) skips the day instead of sending late at night.
 */
export const STUDENT_DIGEST_HOURS = [17, 21] as const;
export const TEACHER_DIGEST_HOURS = [20, 23] as const;
const DIGEST_TASK_LINES = 5;

type Account = { id: number; user_id: number; telegram_user_id: string; telegram_chat_id: string; role?: string };
type Counts = { sent: number; rejected: number; uncertain: number; skipped: number; failed: number };
type Deps = {
  getConnection: () => Promise<SqlConnection>;
  readConfig?: typeof readTelegramConfig;
  send?: typeof sendTelegramMessage;
  nowSec?: () => number;
  logError?: (context: unknown) => void;
};

function lockAccountSql(teacherOnly = false): string {
  return `SELECT uta.id, uta.user_id, uta.telegram_user_id, uta.telegram_chat_id
  FROM user_telegram_accounts uta INNER JOIN app_users u ON u.id = uta.user_id AND u.is_banned = 0
    ${teacherOnly ? "AND u.role IN ('teacher', 'admin')" : ""}
  WHERE uta.id = ? AND uta.telegram_user_id = ? AND uta.telegram_chat_id = uta.telegram_user_id FOR UPDATE`;
}

function isTeacher(account: Account): boolean {
  return account.role === "teacher" || account.role === "admin";
}

function inHours(hour: number, [start, end]: readonly [number, number]): boolean {
  return hour >= start && hour < end;
}

function newTaskMessage(task: TelegramTaskSession, reference: string): { text: string; replyMarkup: InlineKeyboard } {
  const deadline = effectiveDeadline(task);
  return {
    text: `📚 <b>Нове завдання</b>\n\n${html(cleanTitle(task.themeName))}\nЗавдань: ${task.taskCount}` +
      (deadline ? `\n⏰ Термін: ${formatKyivDateTime(deadline)}` : ""),
    replyMarkup: { inline_keyboard: [
      [{ text: "ℹ️ Деталі", callback_data: `d:${reference}` }],
      [{ text: "📚 Мої завдання", callback_data: MENU.tasks }],
    ] },
  };
}

function deadlineMessage(task: TelegramTaskSession, reference: string, deadline: number): { text: string; replyMarkup: InlineKeyboard } {
  return {
    text: `⏰ <b>Скоро термін</b>\n\n${html(cleanTitle(task.themeName))}\nВиконано: ${task.completedTaskCount}/${task.taskCount}` +
      `\nТермін: ${formatKyivDateTime(deadline)}`,
    replyMarkup: { inline_keyboard: [
      [{ text: "ℹ️ Деталі", callback_data: `d:${reference}` }],
      [{ text: "📚 Мої завдання", callback_data: MENU.tasks }],
    ] },
  };
}

function studentDigestMessage(tasks: TelegramTaskSession[]): { text: string; replyMarkup: InlineKeyboard } {
  const lines = [`🔔 <b>Незавершені завдання: ${tasks.length}</b>`, ""];
  for (const task of tasks.slice(0, DIGEST_TASK_LINES)) {
    const deadline = effectiveDeadline(task);
    lines.push(`• ${html(cleanTitle(task.themeName))} — ${task.completedTaskCount}/${task.taskCount}` +
      (deadline ? `, до ${formatKyivDateTime(deadline)}` : ""));
  }
  if (tasks.length > DIGEST_TASK_LINES) lines.push(`…і ще ${tasks.length - DIGEST_TASK_LINES}`);
  return {
    text: lines.join("\n"),
    replyMarkup: { inline_keyboard: [[
      { text: "📚 Мої завдання", callback_data: MENU.tasks }, { text: "📅 Сьогодні", callback_data: MENU.today },
    ]] },
  };
}

/**
 * Deadline reminders only follow a new-task message that was delivered before the reminder window
 * opened; a task announced inside the window already showed its deadline in that message.
 */
async function deadlineReminderAllowed(connection: SqlConnection, account: Account, task: TelegramTaskSession, deadline: number): Promise<boolean> {
  const announced = await readNotificationState(connection, { accountId: account.id, sessionId: task.sessionId, type: TELEGRAM_NEW_TASK_NOTIFICATION });
  if (!announced) return true;
  return announced.state === "delivered" && announced.deliveredAt !== null
    && announced.deliveredAt <= deadline - DEADLINE_REMINDER_WINDOW_SEC;
}

export async function processTelegramTaskNotifications(deps: Deps = { getConnection: loadTelegramConnection }) {
  const counts: Counts = { sent: 0, rejected: 0, uncertain: 0, skipped: 0, failed: 0 };
  const log = deps.logError ?? ((context: unknown) => console.error("telegram notifications failed", context));
  const config = (deps.readConfig ?? readTelegramConfig)();
  const send = deps.send ?? sendTelegramMessage;
  const connection = await deps.getConnection();
  try {
    const now = (deps.nowSec ?? nowUnixSec)();
    const clock = getKyivClock(now);
    const accounts = await connection.query<Account>(`SELECT uta.id, uta.user_id, uta.telegram_user_id, uta.telegram_chat_id, u.role
      FROM user_telegram_accounts uta INNER JOIN app_users u ON u.id = uta.user_id AND u.is_banned = 0
      WHERE uta.telegram_chat_id = uta.telegram_user_id ORDER BY uta.id`);
    // null: migration 042 is not applied — keep exactly the TG-007 new-task behaviour.
    const preferences = await loadNotificationPreferences(connection, accounts.map((account) => Number(account.id)));
    const borrowed = { ...connection, release: () => {} };
    const taskDeps = { getConnection: async () => borrowed, nowSec: deps.nowSec, logError: log };

    /** Claim → lock → recheck → send → record, one ledger row per account/session/type. */
    const deliverSession = async (account: Account, task: TelegramTaskSession, type: string) => {
      const identity = String(account.telegram_user_id);
      const key: NotificationKey = { accountId: account.id, sessionId: task.sessionId, type };
      try {
        const reference = createTaskReference(task.sessionId, identity, config.webhookSecret);
        if (!await claimNotification(connection, key)) { counts.skipped++; return; }
        await connection.beginTransaction();
        const linked = await connection.query<Account>(lockAccountSql(), [account.id, identity]);
        if (linked[0]) {
          await connection.query(`SELECT id FROM task_sessions WHERE id = ? AND user_id = ? FOR UPDATE`, [task.sessionId, linked[0].user_id]);
          await connection.query(`SELECT ma.id FROM mentor_assignment_members mam
            INNER JOIN mentor_assignments ma ON ma.id = mam.assignment_id
            WHERE mam.session_id = ? AND mam.student_user_id = ? FOR UPDATE`, [task.sessionId, linked[0].user_id]);
        }
        const current = linked[0] ? await getTelegramAvailableTaskSessions(identity, taskDeps, task.sessionId) : null;
        if (current?.status === "error" && current.code === "databaseFailure") throw new Error("Notification eligibility read failed.");
        const fresh = current?.status === "success" ? current.sessions[0] : undefined;
        const deadline = fresh ? effectiveDeadline(fresh) : null;
        const stillDue = type !== TELEGRAM_DEADLINE_NOTIFICATION
          || (deadline !== null && deadline > now && deadline - now <= DEADLINE_REMINDER_WINDOW_SEC);
        if (!fresh || !stillDue) {
          await recordNotificationResult(connection, key);
          await connection.commit();
          counts.skipped++;
          return;
        }
        const message = type === TELEGRAM_DEADLINE_NOTIFICATION
          ? deadlineMessage(fresh, reference, deadline!)
          : newTaskMessage(fresh, reference);
        const result = await send({
          chatId: String(linked[0].telegram_chat_id), parseMode: "HTML", disablePreview: true, ...message,
        }, config.botToken);
        if (result.status === "unknown") {
          await connection.rollback();
          counts.uncertain++;
          log({ ...key, stage: "transport", ...result.context });
          return;
        }
        await recordNotificationResult(connection, key, result.status === "sent" ? result.messageId : undefined);
        await connection.commit();
        if (result.status === "sent") counts.sent++;
        else { counts.rejected++; log({ ...key, stage: "transport", ...result.context }); }
      } catch (error) {
        await connection.rollback().catch(() => undefined);
        counts.failed++;
        log({ ...key, stage: "processing", error });
      }
    };

    for (const account of accounts) {
      const prefs: NotificationPreferences = preferences?.get(Number(account.id)) ?? DEFAULT_NOTIFICATION_PREFERENCES;
      if (preferences && isQuietHour(prefs, clock.hour)) {
        // Nothing is claimed: new-task rows stay unclaimed and go out after the quiet hours.
        counts.skipped++;
        continue;
      }
      const identity = String(account.telegram_user_id);
      const tasks = await getTelegramAvailableTaskSessions(identity, taskDeps);
      if (tasks.status === "error") { counts.failed++; continue; }
      for (const task of tasks.sessions) {
        if (!preferences || prefs.newTasks) await deliverSession(account, task, TELEGRAM_NEW_TASK_NOTIFICATION);
        if (!preferences || !prefs.deadlineReminders) continue;
        const deadline = effectiveDeadline(task);
        if (deadline === null || deadline <= now || deadline - now > DEADLINE_REMINDER_WINDOW_SEC) continue;
        try {
          if (await deadlineReminderAllowed(connection, account, task, deadline)) {
            await deliverSession(account, task, TELEGRAM_DEADLINE_NOTIFICATION);
          }
        } catch (error) {
          counts.failed++;
          log({ accountId: account.id, sessionId: task.sessionId, type: TELEGRAM_DEADLINE_NOTIFICATION, stage: "processing", error });
        }
      }
      if (!preferences) continue;
      if (prefs.dailyReminder && tasks.sessions.length && inHours(clock.hour, STUDENT_DIGEST_HOURS) && prefs.studentDigestOn !== clock.date) {
        await sendDigest(connection, account, "student", clock.date, prefs.studentDigestOn,
          { chatId: String(account.telegram_chat_id), parseMode: "HTML", disablePreview: true, ...studentDigestMessage(tasks.sessions) },
          { send, botToken: config.botToken, counts, log });
      }
      if (isTeacher(account)) {
        await processTeacher(connection, account, prefs, { now, clock, send, botToken: config.botToken, counts, log });
      }
    }
    return counts;
  } catch (error) {
    log({ stage: "selection", error });
    throw error;
  } finally { connection.release(); }
}

type RunContext = { send: typeof sendTelegramMessage; botToken: string; counts: Counts; log: (context: unknown) => void };

function tally(result: TelegramSendResult, counts: Counts, log: (context: unknown) => void, context: object): void {
  if (result.status === "sent") counts.sent++;
  else if (result.status === "unknown") { counts.uncertain++; log({ ...context, stage: "transport", ...result.context }); }
  else { counts.rejected++; log({ ...context, stage: "transport", ...result.context }); }
}

/** Once per Kyiv day. The date slot is claimed before sending; only a confirmed rejection gives it back. */
async function sendDigest(
  connection: SqlConnection, account: Account, kind: "student" | "teacher", today: string, previous: string | null,
  reply: TelegramReply, run: RunContext,
): Promise<void> {
  const context = { accountId: account.id, type: `${kind}_digest` };
  try {
    if (!await claimDigest(connection, account.id, kind, today)) { run.counts.skipped++; return; }
    const result = await run.send(reply, run.botToken);
    if (result.status === "rejected") await releaseDigest(connection, account.id, kind, today, previous);
    tally(result, run.counts, run.log, context);
  } catch (error) {
    run.counts.failed++;
    run.log({ ...context, stage: "processing", error });
  }
}

async function processTeacher(
  connection: SqlConnection, account: Account, prefs: NotificationPreferences,
  run: RunContext & { now: number; clock: { date: string; hour: number } },
): Promise<void> {
  const teacherUserId = Number(account.user_id);
  const identity = String(account.telegram_user_id);
  if (prefs.teacherResults) {
    try {
      if (prefs.teacherBaselineAt === null) {
        await ensureNotificationPreferences(connection, account.id);
        await baselineTeacherResults(connection, account.id, teacherUserId);
      } else {
        for (const pending of await listPendingTeacherResults(connection, account.id, teacherUserId)) {
          const key: NotificationKey = { accountId: account.id, sessionId: pending.sessionId, type: TELEGRAM_TEACHER_RESULT_NOTIFICATION };
          try {
            if (!await claimNotification(connection, key)) { run.counts.skipped++; continue; }
            await connection.beginTransaction();
            const linked = await connection.query<Account>(lockAccountSql(true), [account.id, identity]);
            const result = linked[0] ? await lockTeacherResult(connection, teacherUserId, pending.sessionId) : null;
            if (!linked[0] || !result) {
              await recordNotificationResult(connection, key);
              await connection.commit();
              run.counts.skipped++;
              continue;
            }
            const sent = await run.send({
              chatId: String(linked[0].telegram_chat_id), parseMode: "HTML", disablePreview: true, ...formatTeacherResult(result),
            }, run.botToken);
            if (sent.status === "unknown") {
              await connection.rollback();
              tally(sent, run.counts, run.log, key);
              continue;
            }
            await recordNotificationResult(connection, key, sent.status === "sent" ? sent.messageId : undefined);
            await connection.commit();
            tally(sent, run.counts, run.log, key);
          } catch (error) {
            await connection.rollback().catch(() => undefined);
            run.counts.failed++;
            run.log({ ...key, stage: "processing", error });
          }
        }
      }
    } catch (error) {
      run.counts.failed++;
      run.log({ accountId: account.id, type: TELEGRAM_TEACHER_RESULT_NOTIFICATION, stage: "selection", error });
    }
  }
  if (prefs.teacherDaily && inHours(run.clock.hour, TEACHER_DIGEST_HOURS) && prefs.teacherDigestOn !== run.clock.date) {
    try {
      const summary = await getTeacherAssignmentSummary(connection, teacherUserId, run.now);
      if (!summary.length) return;
      await sendDigest(connection, account, "teacher", run.clock.date, prefs.teacherDigestOn, {
        chatId: String(account.telegram_chat_id), parseMode: "HTML", disablePreview: true,
        text: formatTeacherSummary(summary, run.now, "🗓 Підсумок дня"), replyMarkup: teacherSummaryKeyboard(),
      }, run);
    } catch (error) {
      run.counts.failed++;
      run.log({ accountId: account.id, type: "teacher_digest", stage: "selection", error });
    }
  }
}
