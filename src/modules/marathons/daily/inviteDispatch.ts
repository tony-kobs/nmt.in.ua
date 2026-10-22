import "server-only";

import type { SqlConnection } from "@/lib/db/mysql";
import { mysqlErrno } from "@/modules/teacher-students/mysqlErrno";
import {
  loadChannelPreferences,
} from "@/modules/notifications/channelStore";
import { absoluteUrl } from "@/modules/mail/sendMail";
import { notifyUser } from "@/modules/notifications/store";
import { usableChatId } from "@/modules/telegram/linkSync";
import { inviteNotification } from "./invites";
import {
  normalizeInviteAudience,
  selectInviteRecipients,
  type InviteCandidate,
} from "./invite";

type Conn = () => Promise<SqlConnection>;

async function loadConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

export type InviteDispatchDeps = {
  getConnection?: Conn;
  notify?: typeof notifyUser;
  sendEmail?: (input: { to: string; subject: string; text: string }) => Promise<boolean>;
  sendTelegram?: (chatId: string, text: string) => Promise<boolean>;
};

/**
 * One invitation blast when a marathon first becomes active.
 * A second activation or a later save does not send again: the dispatch row is the lock.
 * «Нікого» still takes the lock, so a later audience change does not surprise people.
 */
export async function dispatchMarathonInvites(
  marathonId: number,
  deps: InviteDispatchDeps = {},
): Promise<{ claimed: boolean; recipients: number }> {
  if (!Number.isInteger(marathonId) || marathonId <= 0) return { claimed: false, recipients: 0 };
  const getConnection = deps.getConnection ?? loadConnection;
  const { ensureMarathonSchema } = await import("../schema");
  await ensureMarathonSchema(getConnection);
  const connection = await getConnection();
  try {
    const marathons = await connection.query<{
      id: number;
      slug: string;
      title: string;
      invite_audience: string | null;
      status: string;
    }>(
      `SELECT id, slug, title, invite_audience, status
       FROM marathons WHERE id = ? AND kind = 'daily' LIMIT 1`,
      [marathonId],
    );
    const marathon = marathons[0];
    if (!marathon || marathon.status !== "active") return { claimed: false, recipients: 0 };
    const audience = normalizeInviteAudience(marathon.invite_audience);
    const claim = await connection.execute(
      `INSERT IGNORE INTO marathon_invite_dispatches (marathon_id, audience) VALUES (?, ?)`,
      [marathonId, audience],
    );
    if (claim.affectedRows !== 1) return { claimed: false, recipients: 0 };
    if (audience === "none") return { claimed: true, recipients: 0 };

    const users = await connection.query<{
      id: number;
      role: string;
      email: string | null;
      is_banned: number;
      deletion_due_at?: Date | string | null;
    }>(
      `SELECT id, role, email, is_banned, deletion_due_at FROM app_users`,
      [],
    );
    const declined = new Set(
      (await connection.query<{ user_id: number }>(
        `SELECT user_id FROM marathon_declines WHERE marathon_id = ?`,
        [marathonId],
      )).map((row) => Number(row.user_id)),
    );
    const ids = users
      .filter((user) => !user.is_banned && !user.deletion_due_at)
      .map((user) => Number(user.id));
    const prefs = ids.length ? await loadChannelPreferences(connection, ids) : new Map();
    const chats = new Map<number, string>();
    if (ids.length) {
      const accounts = await connection.query<{
        user_id: number;
        telegram_chat_id: number | string | null;
      }>(
        `SELECT user_id, telegram_chat_id FROM user_telegram_accounts
         WHERE user_id IN (${ids.map(() => "?").join(",")})`,
        ids,
      );
      for (const row of accounts) {
        const chatId = usableChatId(row.telegram_chat_id);
        if (chatId) chats.set(Number(row.user_id), chatId);
      }
      try {
        const participants = await connection.query<{
          user_id: number;
          telegram_chat_id: number | string | null;
        }>(
          `SELECT user_id, telegram_chat_id FROM marathon_participants
           WHERE telegram_chat_id IS NOT NULL AND user_id IN (${ids.map(() => "?").join(",")})`,
          ids,
        );
        for (const row of participants) {
          const chatId = usableChatId(row.telegram_chat_id);
          if (chatId && !chats.has(Number(row.user_id))) chats.set(Number(row.user_id), chatId);
        }
      } catch (error) {
        if (mysqlErrno(error) !== 1146 && mysqlErrno(error) !== 1054) throw error;
      }
    }
    const people: InviteCandidate[] = users
      .filter((user) => !user.is_banned && !user.deletion_due_at)
      .map((user) => {
        const pref = prefs.get(Number(user.id));
        return {
          userId: Number(user.id),
          role: user.role,
          email: user.email,
          telegramChatId: chats.get(Number(user.id)) ?? null,
          declined: declined.has(Number(user.id)),
          marathonEmail: pref ? pref.marathon.email : true,
          marathonTelegram: pref ? pref.marathon.telegram : false,
        };
      });
    const recipients = selectInviteRecipients(audience, people);
    const note = inviteNotification({
      id: marathon.id,
      slug: marathon.slug,
      title: marathon.title,
    });
    const publicLink = absoluteUrl(note.link);
    const notify = deps.notify ?? notifyUser;
    const sendEmail = deps.sendEmail ?? (async (input) => {
      const { sendMail } = await import("@/modules/mail/sendMail");
      const result = await sendMail({ to: input.to, subject: input.subject, text: input.text, html: input.text });
      return result.ok;
    });
    const sendTelegram = deps.sendTelegram ?? (async (chatId, text) => {
      const { optionalTelegramBot } = await import("./botLink");
      const bot = optionalTelegramBot();
      if (!bot) return false;
      const { sendTelegramMessage } = await import("@/modules/telegram/transport");
      const result = await sendTelegramMessage({ chatId, text }, bot.token);
      return result.status === "sent";
    });
    for (const person of recipients) {
      await connection.execute(
        `INSERT IGNORE INTO marathon_invite_recipients (marathon_id, user_id) VALUES (?, ?)`,
        [marathonId, person.userId],
      );
      try {
        await notify({ userId: person.userId, ...note, once: true });
      } catch (error) {
        console.error("marathon invite site", error);
      }
      if (person.marathonEmail && person.email) {
        try {
          await sendEmail({
            to: person.email,
            subject: note.title,
            text: `${note.body}\n${publicLink}`,
          });
        } catch (error) {
          console.error("marathon invite email", error);
        }
      }
      if (person.marathonTelegram && person.telegramChatId) {
        try {
          await sendTelegram(person.telegramChatId, `${note.body}\n${publicLink}`);
        } catch (error) {
          console.error("marathon invite telegram", error);
        }
      }
    }
    return { claimed: true, recipients: recipients.length };
  } finally {
    connection.release();
  }
}
