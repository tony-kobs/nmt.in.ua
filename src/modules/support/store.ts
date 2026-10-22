import "server-only";

import type { SqlConnection } from "@/lib/db/mysql";
import { currentDayNumber } from "@/modules/marathons/daily/calendar";
import { isCopyKey, resolveCopy, type CopyKey } from "@/modules/marathons/daily/copy";
import { resolvePublicChatUrl } from "@/modules/marathons/daily/publicChat";
import { optionalTelegramBot } from "@/modules/marathons/daily/botLink";
import { sendTelegramMessage, type TelegramSendResult } from "@/modules/telegram/transport";
import {
  publicChatNotice,
  readSupportChatId,
  supportMigrationNotice,
  teamTicketHtml,
  type TicketStatus,
} from "./text";

type Conn = () => Promise<SqlConnection>;

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

async function withConn<T>(
  fn: (connection: SqlConnection) => Promise<T>,
  getConnection: Conn = loadDefaultConnection,
): Promise<T> {
  const { ensureMarathonSchema } = await import("@/modules/marathons/schema");
  await ensureMarathonSchema(getConnection);
  const connection = await getConnection();
  try {
    return await fn(connection);
  } finally {
    connection.release();
  }
}

type CourseRow = {
  id: number;
  slug: string;
  title: string;
  start_date: unknown;
  unlock_hour: string;
  days_count: number;
  public_chat_url: string | null;
};

async function selectedCourse(
  connection: SqlConnection,
  chatId: string,
  userId: number,
): Promise<CourseRow | null> {
  if (!/^[1-9]\d{0,19}$/.test(chatId)) return null;
  const rows = await connection.query<CourseRow>(
    `SELECT m.id, m.slug, m.title, m.start_date, m.unlock_hour, m.days_count, m.public_chat_url
     FROM marathon_participants p
     INNER JOIN marathons m ON m.id = p.marathon_id
     WHERE p.telegram_chat_id = ? AND p.user_id = ? AND m.kind = 'daily'
       AND m.status IN ('active', 'finished')
     ORDER BY (p.telegram_selected_at IS NULL) ASC, p.telegram_selected_at DESC, m.id DESC
     LIMIT 1`,
    [chatId, userId],
  );
  return rows[0] ?? null;
}

function dayNumber(course: CourseRow | null, now: Date): number | null {
  if (!course) return null;
  const start = String(course.start_date ?? "").slice(0, 10);
  return currentDayNumber({
    now,
    startDate: start,
    unlockHour: String(course.unlock_hour ?? ""),
    daysCount: Number(course.days_count),
  });
}

async function copyFor(
  connection: SqlConnection,
  marathonId: number | null,
): Promise<Partial<Record<CopyKey, string>>> {
  if (!marathonId) return {};
  const rows = await connection.query<{ copy_key: string; body: string }>(
    `SELECT copy_key, body FROM marathon_copy WHERE marathon_id = ?`,
    [marathonId],
  );
  const copy: Partial<Record<CopyKey, string>> = {};
  for (const row of rows) {
    if (isCopyKey(row.copy_key) && row.body.trim()) copy[row.copy_key] = row.body;
  }
  return copy;
}

export async function loadSupportHelp(
  chatId: string,
  userId: number,
): Promise<{ button: string; chatLine: string | null }> {
  const fallback = {
    button: resolveCopy("bot_btn_support", undefined),
    chatLine: null as string | null,
  };
  if (!process.env.DB_HOST) return fallback;
  try {
    return await withConn(async (connection) => {
      const course = await selectedCourse(connection, chatId, userId);
      const copy = await copyFor(connection, course?.id ?? null);
      const button = resolveCopy("bot_btn_support", copy).trim().slice(0, 64)
        || fallback.button;
      return {
        button,
        chatLine: publicChatNotice(
          course ? resolvePublicChatUrl(course.slug, course.public_chat_url) : "",
          copy,
        ),
      };
    });
  } catch (error) {
    console.error("support help", error);
    return fallback;
  }
}

export async function armSupportWait(
  chatId: string,
  userId: number,
): Promise<{ ok: true; ask: string } | { ok: false }> {
  if (!/^[1-9]\d{0,19}$/.test(chatId) || !Number.isInteger(userId) || userId <= 0) {
    return { ok: false };
  }
  if (!process.env.DB_HOST) return { ok: false };
  try {
    return await withConn(async (connection) => {
      const course = await selectedCourse(connection, chatId, userId);
      const day = dayNumber(course, new Date());
      await connection.execute(
        `INSERT INTO support_waits (chat_id, user_id, marathon_id, day_number)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           user_id = VALUES(user_id),
           marathon_id = VALUES(marathon_id),
           day_number = VALUES(day_number),
           created_at = CURRENT_TIMESTAMP`,
        [chatId, userId, course?.id ?? null, day],
      );
      const copy = await copyFor(connection, course?.id ?? null);
      return { ok: true as const, ask: resolveCopy("bot_support_ask", copy) };
    });
  } catch (error) {
    console.error("support wait", error);
    return { ok: false };
  }
}

export async function peekSupportWait(chatId: string): Promise<boolean> {
  if (!/^[1-9]\d{0,19}$/.test(chatId) || !process.env.DB_HOST) return false;
  try {
    return await withConn(async (connection) => {
      const rows = await connection.query<{ chat_id: string }>(
        `SELECT chat_id FROM support_waits WHERE chat_id = ? LIMIT 1`,
        [chatId],
      );
      return rows.length > 0;
    });
  } catch (error) {
    console.error("support wait", error);
    return false;
  }
}

export async function cancelSupportWait(chatId: string): Promise<void> {
  if (!process.env.DB_HOST) return;
  try {
    await withConn(async (connection) => {
      await connection.execute(`DELETE FROM support_waits WHERE chat_id = ?`, [chatId]);
    });
  } catch (error) {
    console.error("support wait cancel", error);
  }
}

const SAVE_MIGRATED_CHAT = `INSERT INTO support_forward_state (id, migrated_chat_id)
  VALUES (1, ?)
  ON DUPLICATE KEY UPDATE migrated_chat_id = VALUES(migrated_chat_id)`;

function missingRelation(error: unknown): boolean {
  const errno = (error as { errno?: number }).errno;
  return errno === 1146 || errno === 1054;
}

/** Log a group→supergroup id and keep it for the admin banner. The token and the ticket body stay out of the log. */
export async function reportSupportForward(
  result: TelegramSendResult,
  connection: Pick<SqlConnection, "execute">,
  log: (...args: unknown[]) => void = console.error,
): Promise<void> {
  if (result.status === "sent") return;
  const chatId = result.context.migrateToChatId;
  if (chatId && readSupportChatId(chatId)) {
    log("support forward migrate_to_chat_id", chatId);
    try {
      await connection.execute(SAVE_MIGRATED_CHAT, [chatId]);
    } catch (error) {
      if (!missingRelation(error)) log("support forward notice", error);
    }
    return;
  }
  log("support forward", result.status);
}

async function forwardTicket(
  connection: SqlConnection,
  input: {
    id: number;
    displayName: string;
    marathonTitle: string | null;
    dayNumber: number | null;
    chatId: string;
    body: string;
  },
): Promise<void> {
  const team = readSupportChatId(process.env.TELEGRAM_SUPPORT_CHAT_ID);
  const bot = optionalTelegramBot();
  if (!team || !bot) return;
  try {
    const result = await sendTelegramMessage({
      chatId: team,
      text: teamTicketHtml(input),
      parseMode: "HTML",
      disablePreview: true,
    }, bot.token);
    await reportSupportForward(result, connection);
  } catch (error) {
    console.error("support forward", error);
  }
}

export async function acceptSupportMessage(input: {
  chatId: string;
  body: string;
}): Promise<{ text: string } | null> {
  if (!process.env.DB_HOST) return null;
  try {
    return await withConn(async (connection) => {
      const rows = await connection.query<{
        user_id: number;
        marathon_id: number | null;
        day_number: number | null;
        display_name: string | null;
        title: string | null;
      }>(
        `SELECT w.user_id, w.marathon_id, w.day_number, u.display_name, m.title
         FROM support_waits w
         INNER JOIN app_users u ON u.id = w.user_id
         LEFT JOIN marathons m ON m.id = w.marathon_id
         WHERE w.chat_id = ?
         LIMIT 1`,
        [input.chatId],
      );
      const wait = rows[0];
      if (!wait) return null;
      const day = wait.day_number == null ? null : Number(wait.day_number);
      const inserted = await connection.execute(
        `INSERT INTO support_tickets
          (user_id, telegram_chat_id, marathon_id, day_number, body, status)
         VALUES (?, ?, ?, ?, ?, 'new')`,
        [wait.user_id, input.chatId, wait.marathon_id, day, input.body],
      );
      await connection.execute(`DELETE FROM support_waits WHERE chat_id = ?`, [input.chatId]);
      await forwardTicket(connection, {
        id: inserted.insertId,
        displayName: String(wait.display_name ?? ""),
        marathonTitle: wait.title,
        dayNumber: day,
        chatId: input.chatId,
        body: input.body,
      });
      const copy = await copyFor(connection, wait.marathon_id);
      return { text: resolveCopy("bot_support_thanks", copy) };
    });
  } catch (error) {
    console.error("support ticket", error);
    return null;
  }
}

export type SupportTicket = {
  id: number;
  userId: number;
  displayName: string;
  login: string;
  chatId: string;
  marathonId: number | null;
  marathonTitle: string | null;
  dayNumber: number | null;
  body: string;
  status: TicketStatus;
  replyText: string | null;
  createdAt: string;
};

function stamp(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  const date = new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

export async function loadSupportMigrationNotice(): Promise<string | null> {
  if (!process.env.DB_HOST) return null;
  try {
    return await withConn(async (connection) => {
      const rows = await connection.query<{ migrated_chat_id: string }>(
        `SELECT migrated_chat_id FROM support_forward_state WHERE id = 1 LIMIT 1`,
        [],
      );
      return supportMigrationNotice(rows[0]?.migrated_chat_id, process.env.TELEGRAM_SUPPORT_CHAT_ID);
    });
  } catch (error) {
    if (!missingRelation(error)) console.error("support migration notice", error);
    return null;
  }
}

export async function listSupportTickets(status: TicketStatus | "all"): Promise<SupportTicket[]> {
  return withConn(async (connection) => {
    const rows = await connection.query<{
      id: number;
      user_id: number;
      display_name: string | null;
      login: string | null;
      telegram_chat_id: string;
      marathon_id: number | null;
      marathon_title: string | null;
      day_number: number | null;
      body: string;
      status: string;
      reply_text: string | null;
      created_at: unknown;
    }>(
      `SELECT t.id, t.user_id, u.display_name, u.login, t.telegram_chat_id,
              t.marathon_id, m.title AS marathon_title, t.day_number, t.body,
              t.status, t.reply_text, t.created_at
       FROM support_tickets t
       INNER JOIN app_users u ON u.id = t.user_id
       LEFT JOIN marathons m ON m.id = t.marathon_id
       WHERE (? = 'all' OR t.status = ?)
       ORDER BY t.id DESC
       LIMIT 100`,
      [status, status === "all" ? "" : status],
    );
    return rows.flatMap((row) => {
      if (row.status !== "new" && row.status !== "in_progress" && row.status !== "closed") return [];
      return [{
        id: Number(row.id),
        userId: Number(row.user_id),
        displayName: String(row.display_name ?? "").trim(),
        login: String(row.login ?? "").trim(),
        chatId: String(row.telegram_chat_id),
        marathonId: row.marathon_id == null ? null : Number(row.marathon_id),
        marathonTitle: row.marathon_title,
        dayNumber: row.day_number == null ? null : Number(row.day_number),
        body: row.body,
        status: row.status,
        replyText: row.reply_text,
        createdAt: stamp(row.created_at),
      }];
    });
  });
}

export async function updateSupportTicket(input: {
  id: number;
  status: TicketStatus;
  reply: string;
}): Promise<"ok" | "missing" | "send_failed"> {
  return withConn(async (connection) => {
    const rows = await connection.query<{ telegram_chat_id: string }>(
      `SELECT telegram_chat_id FROM support_tickets WHERE id = ? LIMIT 1`,
      [input.id],
    );
    const ticket = rows[0];
    if (!ticket) return "missing";
    const reply = input.reply.trim().slice(0, 4000);
    if (reply) {
      const bot = optionalTelegramBot();
      if (!bot) return "send_failed";
      try {
        const result = await sendTelegramMessage({
          chatId: String(ticket.telegram_chat_id),
          text: reply,
          disablePreview: true,
        }, bot.token);
        if (result.status !== "sent") return "send_failed";
      } catch (error) {
        console.error("support reply", error);
        return "send_failed";
      }
      await connection.execute(
        `UPDATE support_tickets SET status = ?, reply_text = ? WHERE id = ?`,
        [input.status, reply, input.id],
      );
      return "ok";
    }
    const updated = await connection.execute(
      `UPDATE support_tickets SET status = ? WHERE id = ?`,
      [input.status, input.id],
    );
    return updated.affectedRows === 1 ? "ok" : "missing";
  });
}
