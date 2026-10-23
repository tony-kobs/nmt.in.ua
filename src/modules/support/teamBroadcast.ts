import "server-only";

import type { SqlConnection } from "@/lib/db/mysql";
import { optionalTelegramBot } from "@/modules/marathons/daily/botLink";
import { drainTelegramOutbox, serializeReply } from "@/modules/telegram/outbox";
import { usableChatId } from "@/modules/telegram/linkSync";
import type { TelegramReply } from "@/modules/telegram/taskInteraction";
import { sendTelegramMessage, sendTelegramPayload } from "@/modules/telegram/transport";
import {
  handleTeamChat,
  readTeamEvent,
  studentBroadcastReplies,
  type TeamCourse,
  type TeamDeps,
  type TeamDraft,
} from "./teamChat";
import { readSupportChatId } from "./text";
import { updateSupportTicket } from "./store";

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

function missingRelation(error: unknown): boolean {
  const errno = (error as { errno?: number }).errno;
  return errno === 1146 || errno === 1054;
}

const RECIPIENT_SQL = `SELECT DISTINCT p.telegram_chat_id
  FROM marathon_participants p
  INNER JOIN app_users u ON u.id = p.user_id AND u.is_banned = 0 AND u.deletion_due_at IS NULL
  INNER JOIN user_telegram_accounts uta
    ON uta.user_id = p.user_id AND uta.telegram_chat_id = p.telegram_chat_id
  LEFT JOIN marathon_declines md
    ON md.marathon_id = p.marathon_id AND md.user_id = p.user_id
  WHERE p.marathon_id = ?
    AND p.notify_paused = 0
    AND md.user_id IS NULL`;

/** Linked Telegram, not paused, not unlinked by /stop, not declined. */
export async function broadcastRecipientChats(
  connection: Pick<SqlConnection, "query">,
  marathonId: number,
): Promise<string[]> {
  const rows = await connection.query<{ telegram_chat_id: number | string | null }>(RECIPIENT_SQL, [marathonId]);
  const chats = new Set<string>();
  for (const row of rows) {
    const chatId = usableChatId(row.telegram_chat_id);
    if (chatId) chats.add(chatId);
  }
  return [...chats];
}

export async function isSiteAdmin(
  connection: Pick<SqlConnection, "query">,
  telegramUserId: string,
): Promise<boolean> {
  const rows = await connection.query<{ role: string }>(
    `SELECT u.role
     FROM user_telegram_accounts uta
     INNER JOIN app_users u ON u.id = uta.user_id AND u.is_banned = 0
     WHERE uta.telegram_user_id = ?
     LIMIT 1`,
    [telegramUserId],
  );
  return rows[0]?.role === "admin";
}

export function isGroupAdminStatus(status: unknown): boolean {
  return status === "creator" || status === "administrator";
}

export async function telegramGroupAdmin(input: {
  token: string;
  chatId: string;
  userId: string;
  request?: typeof fetch;
}): Promise<boolean> {
  const request = input.request ?? fetch;
  try {
    const response = await request(`https://api.telegram.org/bot${input.token}/getChatMember`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: input.chatId, user_id: Number(input.userId) }),
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    const body: unknown = await response.json();
    const status = (body as { result?: { status?: unknown } }).result?.status;
    return isGroupAdminStatus(status);
  } catch (error) {
    console.error("team chat member", error instanceof Error ? error.name : "error");
    return false;
  }
}

function asDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const date = new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? null : date;
}

function draftFrom(row: {
  id: number;
  marathon_id: number;
  body: string;
  photo_file_id: string | null;
  status: string;
  preview_chat_id: string;
  preview_message_id: number | null;
  sent_count: number;
  expires_at: unknown;
}): TeamDraft | null {
  if (row.status !== "draft" && row.status !== "sent" && row.status !== "cancelled") return null;
  const expires = asDate(row.expires_at);
  const photo = typeof row.photo_file_id === "string" ? row.photo_file_id.trim() : "";
  return {
    id: Number(row.id),
    marathonId: Number(row.marathon_id),
    body: row.body,
    photoFileId: photo || null,
    status: row.status,
    expired: row.status === "draft" && (!expires || expires.getTime() <= Date.now()),
    previewChatId: String(row.preview_chat_id),
    previewMessageId: row.preview_message_id == null ? null : Number(row.preview_message_id),
    sentCount: Number(row.sent_count) || 0,
  };
}

const DRAFT_FIELDS = `id, marathon_id, body, photo_file_id, status, preview_chat_id, preview_message_id, sent_count, expires_at`;

function productionDeps(input: {
  token: string;
  chatId: string;
  request?: typeof fetch;
  acknowledge?: (queryId: string) => Promise<void>;
  getConnection?: Conn;
}): TeamDeps {
  const getConnection = input.getConnection ?? loadDefaultConnection;
  return {
    acknowledge: input.acknowledge,
    authorize: async (userId) => {
      const admin = await withConn((connection) => isSiteAdmin(connection, userId), getConnection).catch((error) => {
        console.error("team chat site admin", error);
        return false;
      });
      if (admin) return true;
      return telegramGroupAdmin({
        token: input.token,
        chatId: input.chatId,
        userId,
        request: input.request,
      });
    },
    courses: () => withConn(async (connection) => {
      const rows = await connection.query<{
        id: number;
        slug: string;
        title: string;
        status: string;
      }>(
        `SELECT id, slug, title, status
         FROM marathons
         WHERE kind = 'daily' AND status <> 'archived'
         ORDER BY id`,
        [],
      );
      return rows.flatMap((row) => {
        if (row.status !== "draft" && row.status !== "active" && row.status !== "finished") return [];
        const course: TeamCourse = {
          id: Number(row.id),
          slug: row.slug,
          title: row.title,
          status: row.status,
        };
        return [course];
      });
    }, getConnection),
    recipients: (marathonId) => withConn(
      (connection) => broadcastRecipientChats(connection, marathonId),
      getConnection,
    ),
    saveDraft: (draft) => withConn(async (connection) => {
      const inserted = await connection.execute(
        `INSERT INTO marathon_team_broadcasts
          (marathon_id, author_tg_id, body, photo_file_id, status, recipient_count, preview_chat_id, expires_at)
         VALUES (?, ?, ?, ?, 'draft', ?, ?, DATE_ADD(CURRENT_TIMESTAMP, INTERVAL 1 HOUR))`,
        [
          draft.marathonId,
          draft.authorTgId,
          draft.body,
          draft.photoFileId,
          draft.recipientCount,
          draft.previewChatId,
        ],
      );
      return Number(inserted.insertId);
    }, getConnection),
    rememberPreview: (id, messageId) => withConn(async (connection) => {
      await connection.execute(
        `UPDATE marathon_team_broadcasts SET preview_message_id = ? WHERE id = ?`,
        [messageId, id],
      );
    }, getConnection),
    loadDraft: (id) => withConn(async (connection) => {
      const rows = await connection.query<{
        id: number;
        marathon_id: number;
        body: string;
        status: string;
        preview_chat_id: string;
        photo_file_id: string | null;
        preview_message_id: number | null;
        sent_count: number;
        expires_at: unknown;
      }>(
        `SELECT ${DRAFT_FIELDS} FROM marathon_team_broadcasts WHERE id = ? LIMIT 1`,
        [id],
      );
      const row = rows[0];
      return row ? draftFrom(row) : null;
    }, getConnection),
    markSent: (id, count) => withConn(async (connection) => {
      const updated = await connection.execute(
        `UPDATE marathon_team_broadcasts
         SET status = 'sent', sent_count = ?, confirmed_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'draft' AND expires_at > CURRENT_TIMESTAMP`,
        [count, id],
      );
      return updated.affectedRows === 1;
    }, getConnection),
    setSentCount: (id, count) => withConn(async (connection) => {
      await connection.execute(
        `UPDATE marathon_team_broadcasts SET sent_count = ?, recipient_count = ? WHERE id = ?`,
        [count, count, id],
      );
    }, getConnection),
    markCancelled: (id) => withConn(async (connection) => {
      const updated = await connection.execute(
        `UPDATE marathon_team_broadcasts
         SET status = 'cancelled'
         WHERE id = ? AND status = 'draft'`,
        [id],
      );
      return updated.affectedRows === 1;
    }, getConnection),
    revertToDraft: (id) => withConn(async (connection) => {
      await connection.execute(
        `UPDATE marathon_team_broadcasts
         SET status = 'draft', confirmed_at = NULL
         WHERE id = ? AND status = 'sent'`,
        [id],
      );
    }, getConnection),
    enqueue: async ({ marathonId, chats, body, photoFileId }) => {
      const { enqueueMarathonTelegram } = await import("@/modules/marathons/daily/store");
      const rows = chats.flatMap((chatId) => studentBroadcastReplies(chatId, body, photoFileId).map((reply) => ({
        chatId,
        marathonId,
        payload: serializeReply(reply),
      })));
      await enqueueMarathonTelegram(rows, getConnection);
    },
    send: async (reply) => {
      const photo = reply.photoFileId?.trim();
      if (photo && !reply.editMessageId) {
        const caption = reply.text.trim();
        const result = await sendTelegramPayload({
          method: "sendPhoto",
          token: input.token,
          request: input.request ?? fetch,
          json: {
            chat_id: reply.chatId,
            photo,
            ...(caption ? { caption: caption.slice(0, 1024) } : {}),
            ...(reply.replyMarkup ? { reply_markup: reply.replyMarkup } : {}),
          },
        });
        return result.status === "sent" ? { ok: true, messageId: result.messageId } : { ok: false };
      }
      const result = await sendTelegramMessage(reply, input.token, input.request);
      return result.status === "sent" ? { ok: true, messageId: result.messageId } : { ok: false };
    },
    scheduleDrain: () => {
      void import("next/server").then(({ after }) => {
        after(() => {
          void drainTelegramOutbox({ budgetMs: 20_000 }).catch((error: unknown) => {
            console.error("team broadcast outbox", error);
          });
        });
      }).catch((error: unknown) => {
        console.error("team broadcast schedule", error);
      });
    },
    findTicket: (messageId) => withConn(async (connection) => {
      try {
        const rows = await connection.query<{ id: number }>(
          `SELECT id FROM support_tickets WHERE forward_message_id = ? LIMIT 1`,
          [messageId],
        );
        const row = rows[0];
        return row ? { id: Number(row.id) } : null;
      } catch (error) {
        if (missingRelation(error)) return null;
        throw error;
      }
    }, getConnection),
    replyTicket: async (id, text) => updateSupportTicket({ id, status: "in_progress", reply: text }),
  };
}

export async function dispatchTeamChat(
  update: unknown,
  acknowledge?: (queryId: string) => Promise<void>,
  request?: typeof fetch,
): Promise<{ handled: true; reply: TelegramReply | null } | { handled: false }> {
  const supportChatId = readSupportChatId(process.env.TELEGRAM_SUPPORT_CHAT_ID);
  if (!supportChatId) return { handled: false };
  const bot = optionalTelegramBot();
  const event = readTeamEvent(update, supportChatId, bot?.username ?? "");
  if (event === null) return { handled: false };
  if (event === "ignore" || !bot) return { handled: true, reply: null };
  try {
    const reply = await handleTeamChat(event, productionDeps({
      token: bot.token,
      chatId: supportChatId,
      request,
      acknowledge,
    }));
    return { handled: true, reply };
  } catch (error) {
    console.error("team chat", error);
    return { handled: true, reply: null };
  }
}
