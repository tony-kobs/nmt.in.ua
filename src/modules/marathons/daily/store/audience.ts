import "server-only";

import { resolveMarathonDelivery } from "@/modules/notifications/channels";
import { isDeliveryChannel, type DeliveryChannel } from "../channel";
import { isCopyKey, type CopyKey } from "../copy";
import { clampHour, flag, isoDate, withConn, type Conn } from "./db";
import type { DailyStatus } from "./types";

export type NotifyAudienceMarathon = {
  marathonId: number;
  slug: string;
  title: string;
  startDate: string;
  unlockHour: string;
  reminderHour: string;
  nudgeFrom: number;
  nudgeUntil: number;
  daysCount: number;
  /** Day numbers that have at least one task. Topic-only rows are not content. */
  contentDayNumbers: number[];
  topics: Record<number, string>;
  copy: Partial<Record<CopyKey, string>>;
  /** Absent in older fixtures. A set value other than active must not be sent. */
  status?: DailyStatus;
  people: Array<{
    userId: number;
    email: string | null;
    displayName: string;
    telegramChatId: string | null;
    notifyEmail: boolean;
    notifyBot: boolean;
    paused?: boolean;
    channel: DeliveryChannel | null;
    completedDayNumbers: number[];
  }>;
};

export async function loadNotifyAudience(
  getConnection?: Conn,
): Promise<NotifyAudienceMarathon[]> {
  return withConn(async (connection) => {
    const rows = await connection.query<{
      marathon_id: number;
      slug: string;
      title: string;
      start_date: unknown;
      unlock_hour: string;
      reminder_hour: string | null;
      nudge_from: number | null;
      nudge_until: number | null;
      days_count: number;
      day_number: number | null;
      topic: string | null;
      task_count: number | null;
      user_id: number;
      email: string | null;
      display_name: string | null;
      telegram_chat_id: number | string | null;
      notify_email: number;
      notify_bot: number;
      delivery_channel: string | null;
      notify_paused: number;
      pref_email: number | null;
      pref_telegram: number | null;
      account_chat_id: number | string | null;
      completed_at: unknown;
      is_banned: number;
    }>(
      `SELECT m.id AS marathon_id, m.slug, m.title, m.start_date, m.unlock_hour,
              m.reminder_hour, m.nudge_from, m.nudge_until, m.days_count,
              d.day_number, d.topic,
              (SELECT COUNT(*) FROM marathon_day_tasks tk WHERE tk.day_id = d.id) AS task_count,
              p.user_id, u.email, u.display_name, p.telegram_chat_id, p.notify_email, p.notify_bot,
              p.delivery_channel, p.notify_paused, npref.email_on AS pref_email,
              npref.telegram_on AS pref_telegram, uta.telegram_chat_id AS account_chat_id,
              pr.completed_at, u.is_banned
       FROM marathons m
       INNER JOIN marathon_participants p ON p.marathon_id = m.id
       INNER JOIN app_users u ON u.id = p.user_id
       LEFT JOIN user_channel_preferences npref
         ON npref.user_id = p.user_id AND npref.category = 'marathon'
       LEFT JOIN user_telegram_accounts uta ON uta.user_id = p.user_id
       LEFT JOIN marathon_days d ON d.marathon_id = m.id
       LEFT JOIN marathon_day_progress pr
         ON pr.marathon_id = m.id AND pr.user_id = p.user_id AND pr.day_id = d.id
       WHERE m.kind = 'daily' AND m.status = 'active' AND u.deletion_due_at IS NULL`,
      [],
    );
    const grouped = new Map<number, NotifyAudienceMarathon>();
    const people = new Map<string, NotifyAudienceMarathon["people"][number]>();
    const contentDays = new Map<number, Set<number>>();
    for (const row of rows) {
      if (flag(row.is_banned)) continue;
      let marathon = grouped.get(row.marathon_id);
      if (!marathon) {
        const startDate = isoDate(row.start_date);
        if (!startDate) continue;
        marathon = {
          marathonId: row.marathon_id,
          slug: row.slug,
          title: row.title,
          startDate,
          unlockHour: String(row.unlock_hour).slice(0, 5),
          reminderHour: String(row.reminder_hour ?? "19:00").slice(0, 5),
          nudgeFrom: clampHour(row.nudge_from, 10),
          nudgeUntil: clampHour(row.nudge_until, 21),
          daysCount: Number(row.days_count),
          contentDayNumbers: [],
          topics: {},
          copy: {},
          status: "active",
          people: [],
        };
        grouped.set(row.marathon_id, marathon);
        contentDays.set(row.marathon_id, new Set());
      }
      if (row.day_number != null && Number(row.task_count) > 0) {
        contentDays.get(row.marathon_id)?.add(Number(row.day_number));
        if (row.topic) marathon.topics[row.day_number] = row.topic;
      }
      const personKey = `${row.marathon_id}:${row.user_id}`;
      let person = people.get(personKey);
      if (!person) {
        const channel = isDeliveryChannel(row.delivery_channel) ? row.delivery_channel : null;
        const paused = flag(row.notify_paused);
        const delivery = resolveMarathonDelivery({
          columnEmail: flag(row.notify_email),
          columnTelegram: flag(row.notify_bot),
          paused,
          preference: row.pref_email == null && row.pref_telegram == null
            ? null
            : { email: flag(row.pref_email), telegram: flag(row.pref_telegram) },
        });
        const accountChat = row.account_chat_id == null ? null : String(row.account_chat_id);
        person = {
          userId: row.user_id,
          email: row.email,
          displayName: row.display_name?.trim() || "",
          telegramChatId:
            row.telegram_chat_id == null ? accountChat : String(row.telegram_chat_id),
          notifyEmail: delivery.notifyEmail,
          notifyBot: delivery.notifyBot,
          paused,
          channel,
          completedDayNumbers: [],
        };
        people.set(personKey, person);
        marathon.people.push(person);
      }
      if (row.day_number != null && row.completed_at) {
        person.completedDayNumbers.push(row.day_number);
      }
    }
    const ids = [...grouped.keys()];
    if (ids.length > 0) {
      const copies = await connection.query<{
        marathon_id: number;
        copy_key: string;
        body: string;
      }>(
        `SELECT marathon_id, copy_key, body FROM marathon_copy
         WHERE marathon_id IN (${ids.map(() => "?").join(",")})`,
        ids,
      );
      for (const row of copies) {
        const marathon = grouped.get(row.marathon_id);
        if (marathon && isCopyKey(row.copy_key) && row.body.trim()) {
          marathon.copy[row.copy_key] = row.body;
        }
      }
    }
    for (const marathon of grouped.values()) {
      marathon.contentDayNumbers = [...(contentDays.get(marathon.marathonId) ?? [])].sort(
        (left, right) => left - right,
      );
    }
    return [...grouped.values()];
  }, getConnection);
}
