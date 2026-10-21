import "server-only";

import type { SqlConnection } from "@/lib/db/mysql";
import { resolveMarathonDelivery } from "@/modules/notifications/channels";
import { absoluteUrl, sendMail } from "@/modules/mail/sendMail";
import { personNotifyChannels } from "./channel";
import { unsubscribeToken } from "./notifications";
import { wrapMarathonMail } from "./mailCopy";
import { optionalTelegramBot } from "./botLink";
import { sendThrottled, sharedTelegramPace } from "@/modules/telegram/throttle";
import { sendTelegramMessage } from "@/modules/telegram/transport";
import { isDefinitiveTelegramFailure } from "./notifications";
import {
  findSlotOverride,
  type JobSnapshot,
  type LedgerCount,
  type OutboxSnapshot,
  type SlotOverride,
  type TimelineChannel,
  type TimelinePerson,
} from "./messageTimeline";

type Conn = () => Promise<SqlConnection>;

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

async function withConn<T>(
  fn: (connection: SqlConnection) => Promise<T>,
  getConnection: Conn = loadDefaultConnection,
): Promise<T> {
  const { ensureMarathonSchema } = await import("../schema");
  await ensureMarathonSchema(getConnection);
  const connection = await getConnection();
  try {
    return await fn(connection);
  } finally {
    connection.release();
  }
}

function flag(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

function asDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function mapOverride(row: {
  marathon_id: number;
  day_number: number;
  kind: string;
  channel: string;
  cancelled: unknown;
  send_at: unknown;
  body: string | null;
}): SlotOverride {
  return {
    marathonId: Number(row.marathon_id),
    dayNumber: Number(row.day_number),
    kind: row.kind,
    channel: row.channel,
    cancelled: flag(row.cancelled),
    sendAt: asDate(row.send_at),
    body: row.body,
  };
}

export async function listSlotOverrides(marathonId?: number): Promise<SlotOverride[]> {
  return withConn(async (connection) => {
    const rows = await connection.query<{
      marathon_id: number;
      day_number: number;
      kind: string;
      channel: string;
      cancelled: unknown;
      send_at: unknown;
      body: string | null;
    }>(
      marathonId == null
        ? `SELECT marathon_id, day_number, kind, channel, cancelled, send_at, body
           FROM marathon_message_overrides`
        : `SELECT marathon_id, day_number, kind, channel, cancelled, send_at, body
           FROM marathon_message_overrides
           WHERE marathon_id = ?`,
      marathonId == null ? [] : [marathonId],
    );
    return rows.map(mapOverride);
  });
}

/** Missing database or a failed read leaves the planner on the natural schedule. */
export async function loadOverridesSafe(marathonId?: number): Promise<SlotOverride[]> {
  if (!process.env.DB_HOST) return [];
  try {
    return await listSlotOverrides(marathonId);
  } catch (error) {
    console.error("marathon message overrides", error);
    return [];
  }
}

export async function saveSlotOverride(row: SlotOverride & { marathonId: number }): Promise<void> {
  await withConn(async (connection) => {
    await connection.execute(
      `INSERT INTO marathon_message_overrides
        (marathon_id, day_number, kind, channel, cancelled, send_at, body)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         cancelled = VALUES(cancelled),
         send_at = VALUES(send_at),
         body = VALUES(body)`,
      [
        row.marathonId,
        row.dayNumber,
        row.kind,
        row.channel,
        row.cancelled ? 1 : 0,
        row.sendAt,
        row.body,
      ],
    );
  });
}

/** Closes queued sends for one course. Scores, participants and sent history stay. */
export async function silenceMarathonSends(marathonId: number): Promise<void> {
  if (!process.env.DB_HOST) return;
  await withConn(async (connection) => {
    await connection.execute(
      `UPDATE marathon_message_jobs
       SET status = 'cancelled'
       WHERE marathon_id = ? AND status IN ('queued', 'sending', 'failed')`,
      [marathonId],
    );
    await connection.execute(
      `UPDATE marathon_telegram_outbox
       SET status = 'cancelled'
       WHERE marathon_id = ? AND status IN ('pending', 'failed')`,
      [marathonId],
    );
    await connection.execute(
      `UPDATE marathon_notifications
       SET delivered = 1, outcome = 'cancelled'
       WHERE marathon_id = ? AND delivered = 0`,
      [marathonId],
    );
  });
}

async function marathonIsArchived(marathonId: number): Promise<boolean> {
  return withConn(async (connection) => {
    const rows = await connection.query<{ status: string }>(
      `SELECT status FROM marathons WHERE id = ? LIMIT 1`,
      [marathonId],
    );
    return rows[0]?.status === "archived";
  });
}

export async function markNotificationOutcome(
  intent: {
    marathonId: number;
    userId: number;
    dayNumber: number;
    kind: string;
    channel: string;
  },
  outcome: "cancelled",
): Promise<void> {
  if (!process.env.DB_HOST) return;
  try {
    await withConn(async (connection) => {
      await connection.execute(
        `UPDATE marathon_notifications
         SET outcome = ?
         WHERE marathon_id = ? AND user_id = ? AND day_number = ? AND kind = ? AND channel = ?`,
        [outcome, intent.marathonId, intent.userId, intent.dayNumber, intent.kind, intent.channel],
      );
    });
  } catch (error) {
    console.error("marathon notification outcome", error);
  }
}

export type TimelineSnapshot = {
  people: TimelinePerson[];
  ledger: LedgerCount[];
  overrides: SlotOverride[];
  outbox: OutboxSnapshot[];
  jobs: JobSnapshot[];
};

function readOutbox(payload: string): { text: string; dayNumber: number | null; kind: string | null } {
  try {
    const value = JSON.parse(payload) as {
      text?: unknown;
      schedule?: { dayNumber?: unknown; kind?: unknown };
    };
    const dayNumber = Number(value.schedule?.dayNumber);
    return {
      text: typeof value.text === "string" ? value.text : payload.slice(0, 500),
      dayNumber: Number.isInteger(dayNumber) && dayNumber > 0 ? dayNumber : null,
      kind: typeof value.schedule?.kind === "string" ? value.schedule.kind : null,
    };
  } catch {
    return { text: payload.slice(0, 500), dayNumber: null, kind: null };
  }
}

export async function loadTimelineSnapshot(marathonId: number): Promise<TimelineSnapshot> {
  return withConn(async (connection) => {
    const peopleRows = await connection.query<{
      user_id: number;
      email: string | null;
      telegram_chat_id: number | string | null;
      notify_email: number;
      notify_bot: number;
      delivery_channel: string | null;
      notify_paused: number;
      pref_email: number | null;
      pref_telegram: number | null;
      account_chat_id: number | string | null;
      day_number: number | null;
      completed_at: unknown;
      is_banned: number;
      declined: number;
    }>(
      `SELECT p.user_id, u.email, p.telegram_chat_id, p.notify_email, p.notify_bot,
              p.delivery_channel, p.notify_paused, npref.email_on AS pref_email,
              npref.telegram_on AS pref_telegram, uta.telegram_chat_id AS account_chat_id,
              d.day_number, pr.completed_at, u.is_banned,
              IF(md.user_id IS NULL, 0, 1) AS declined
       FROM marathon_participants p
       INNER JOIN app_users u ON u.id = p.user_id
       LEFT JOIN user_channel_preferences npref
         ON npref.user_id = p.user_id AND npref.category = 'marathon'
       LEFT JOIN user_telegram_accounts uta ON uta.user_id = p.user_id
       LEFT JOIN marathon_declines md
         ON md.marathon_id = p.marathon_id AND md.user_id = p.user_id
       LEFT JOIN marathon_days d ON d.marathon_id = p.marathon_id
       LEFT JOIN marathon_day_progress pr
         ON pr.marathon_id = p.marathon_id AND pr.user_id = p.user_id AND pr.day_id = d.id
       WHERE p.marathon_id = ?`,
      [marathonId],
    );
    const people = new Map<number, TimelinePerson>();
    for (const row of peopleRows) {
      if (flag(row.is_banned)) continue;
      let person = people.get(row.user_id);
      if (!person) {
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
          email: row.email,
          telegramChatId: row.telegram_chat_id == null ? accountChat : String(row.telegram_chat_id),
          notifyEmail: delivery.notifyEmail,
          notifyBot: delivery.notifyBot,
          paused,
          declined: flag(row.declined),
          completedDayNumbers: [],
        };
        people.set(row.user_id, person);
      }
      if (row.day_number != null && row.completed_at) {
        person.completedDayNumbers.push(Number(row.day_number));
      }
    }

    const ledgerRows = await connection.query<{
      day_number: number;
      kind: string;
      channel: string;
      sent: number;
      pending: number;
    }>(
      `SELECT day_number, kind, channel,
              SUM(delivered = 1 AND (outcome IS NULL OR outcome <> 'cancelled')) AS sent,
              SUM(delivered = 0) AS pending
       FROM marathon_notifications
       WHERE marathon_id = ?
       GROUP BY day_number, kind, channel`,
      [marathonId],
    );

    const outboxRows = await connection.query<{
      id: number;
      status: OutboxSnapshot["status"];
      not_before: unknown;
      created_at: unknown;
      payload: string;
    }>(
      `SELECT id, status, not_before, created_at, payload
       FROM marathon_telegram_outbox
       WHERE marathon_id = ?
       ORDER BY id DESC
       LIMIT 200`,
      [marathonId],
    );

    const jobRows = await connection.query<{
      id: number;
      user_id: number;
      day_number: number;
      kind: string;
      channel: string;
      body: string;
      send_at: unknown;
      status: JobSnapshot["status"];
    }>(
      `SELECT id, user_id, day_number, kind, channel, body, send_at, status
       FROM marathon_message_jobs
       WHERE marathon_id = ?`,
      [marathonId],
    );

    const overrides = (await connection.query<{
      marathon_id: number;
      day_number: number;
      kind: string;
      channel: string;
      cancelled: unknown;
      send_at: unknown;
      body: string | null;
    }>(
      `SELECT marathon_id, day_number, kind, channel, cancelled, send_at, body
       FROM marathon_message_overrides
       WHERE marathon_id = ?`,
      [marathonId],
    )).map(mapOverride);

    return {
      people: [...people.values()],
      ledger: ledgerRows.map((row) => ({
        dayNumber: Number(row.day_number),
        kind: row.kind,
        channel: row.channel,
        sent: Number(row.sent) || 0,
        pending: Number(row.pending) || 0,
      })),
      overrides,
      outbox: outboxRows.flatMap((row) => {
        const createdAt = asDate(row.created_at);
        if (!createdAt) return [];
        const parsed = readOutbox(row.payload);
        const status = row.status;
        if (status !== "pending" && status !== "sent" && status !== "failed" && status !== "cancelled") {
          return [];
        }
        return [{
          id: Number(row.id),
          status,
          notBefore: asDate(row.not_before),
          createdAt,
          text: parsed.text,
          dayNumber: parsed.dayNumber,
          kind: parsed.kind,
        }];
      }),
      jobs: jobRows.flatMap((row) => {
        const sendAt = asDate(row.send_at);
        if (!sendAt) return [];
        return [{
          id: Number(row.id),
          userId: Number(row.user_id),
          dayNumber: Number(row.day_number),
          kind: row.kind,
          channel: row.channel,
          body: row.body,
          sendAt,
          status: row.status,
        }];
      }),
    };
  });
}

export async function rewriteOutbox(
  input: {
    marathonId: number;
    outboxId: number;
    text?: string;
    notBefore?: Date | null;
    cancel?: boolean;
  },
): Promise<boolean> {
  return withConn(async (connection) => {
    const rows = await connection.query<{ payload: string; status: string; not_before: unknown }>(
      `SELECT payload, status, not_before FROM marathon_telegram_outbox
       WHERE id = ? AND marathon_id = ? AND status IN ('pending', 'failed')`,
      [input.outboxId, input.marathonId],
    );
    const row = rows[0];
    if (!row) return false;
    if (input.cancel) {
      const result = await connection.execute(
        `UPDATE marathon_telegram_outbox
         SET status = 'cancelled'
         WHERE id = ? AND marathon_id = ? AND status IN ('pending', 'failed')`,
        [input.outboxId, input.marathonId],
      );
      return result.affectedRows === 1;
    }
    let payload = row.payload;
    if (input.text != null) {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(row.payload) as Record<string, unknown>;
      } catch {
        return false;
      }
      parsed.text = input.text;
      payload = JSON.stringify(parsed);
    }
    const notBefore = input.notBefore === undefined ? asDate(row.not_before) : input.notBefore;
    const result = await connection.execute(
      `UPDATE marathon_telegram_outbox
       SET payload = ?, not_before = ?, status = 'pending'
       WHERE id = ? AND marathon_id = ? AND status IN ('pending', 'failed')`,
      [payload, notBefore, input.outboxId, input.marathonId],
    );
    return result.affectedRows === 1;
  });
}

export type MessageJobInput = {
  marathonId: number;
  userId: number;
  dayNumber: number;
  kind: string;
  channel: TimelineChannel;
  body: string;
  sendAt: Date;
};

export async function enqueueMessageJob(input: MessageJobInput): Promise<void> {
  await withConn(async (connection) => {
    const existing = await connection.query<{ id: number }>(
      `SELECT id FROM marathon_message_jobs
       WHERE marathon_id = ? AND user_id = ? AND day_number = ? AND kind = ? AND channel = ?
         AND status IN ('queued', 'sending')
       LIMIT 1`,
      [input.marathonId, input.userId, input.dayNumber, input.kind, input.channel],
    );
    if (existing[0]) {
      await connection.execute(
        `UPDATE marathon_message_jobs
         SET body = ?, send_at = ?, status = 'queued'
         WHERE id = ? AND status IN ('queued', 'sending')`,
        [input.body, input.sendAt, existing[0].id],
      );
      return;
    }
    await connection.execute(
      `INSERT INTO marathon_message_jobs
        (marathon_id, user_id, day_number, kind, channel, body, send_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'queued')`,
      [
        input.marathonId,
        input.userId,
        input.dayNumber,
        input.kind,
        input.channel,
        input.body,
        input.sendAt,
      ],
    );
  });
}

export async function updateMessageJob(input: {
  marathonId: number;
  jobId: number;
  body?: string;
  sendAt?: Date;
  cancel?: boolean;
}): Promise<boolean> {
  return withConn(async (connection) => {
    if (input.cancel) {
      const result = await connection.execute(
        `UPDATE marathon_message_jobs
         SET status = 'cancelled'
         WHERE id = ? AND marathon_id = ? AND status IN ('queued', 'failed')`,
        [input.jobId, input.marathonId],
      );
      return result.affectedRows === 1;
    }
    const sets: string[] = ["status = 'queued'"];
    const params: unknown[] = [];
    if (input.body != null) {
      sets.push("body = ?");
      params.push(input.body);
    }
    if (input.sendAt) {
      sets.push("send_at = ?");
      params.push(input.sendAt);
    }
    params.push(input.jobId, input.marathonId);
    const result = await connection.execute(
      `UPDATE marathon_message_jobs
       SET ${sets.join(", ")}
       WHERE id = ? AND marathon_id = ? AND status IN ('queued', 'failed')`,
      params,
    );
    return result.affectedRows === 1;
  });
}

export async function syncQueuedJobs(input: {
  marathonId: number;
  dayNumber: number;
  kind: string;
  channel: string;
  body?: string;
  sendAt?: Date;
  cancel?: boolean;
}): Promise<void> {
  await withConn(async (connection) => {
    if (input.cancel) {
      await connection.execute(
        `UPDATE marathon_message_jobs
         SET status = 'cancelled'
         WHERE marathon_id = ? AND day_number = ? AND kind = ? AND channel = ?
           AND status IN ('queued', 'failed')`,
        [input.marathonId, input.dayNumber, input.kind, input.channel],
      );
      return;
    }
    const sets: string[] = [];
    const params: unknown[] = [];
    if (input.body != null) {
      sets.push("body = ?");
      params.push(input.body);
    }
    if (input.sendAt) {
      sets.push("send_at = ?");
      params.push(input.sendAt);
    }
    if (sets.length === 0) return;
    params.push(input.marathonId, input.dayNumber, input.kind, input.channel);
    await connection.execute(
      `UPDATE marathon_message_jobs
       SET ${sets.join(", ")}
       WHERE marathon_id = ? AND day_number = ? AND kind = ? AND channel = ?
         AND status IN ('queued', 'failed')`,
      params,
    );
  });
}

type DueJob = MessageJobInput & { id: number };

async function claimDueJobs(now: Date): Promise<DueJob[]> {
  return withConn(async (connection) => {
    await connection.execute(
      `UPDATE marathon_message_jobs SET status = 'queued' WHERE status = 'sending'`,
      [],
    );
    const rows = await connection.query<{
      id: number;
      marathon_id: number;
      user_id: number;
      day_number: number;
      kind: string;
      channel: string;
      body: string;
      send_at: unknown;
    }>(
      `SELECT id, marathon_id, user_id, day_number, kind, channel, body, send_at
       FROM marathon_message_jobs
       WHERE status = 'queued' AND send_at <= ?
       ORDER BY send_at, id
       LIMIT 20`,
      [now],
    );
    const claimed: DueJob[] = [];
    for (const row of rows) {
      const sendAt = asDate(row.send_at);
      if (!sendAt) continue;
      if (row.channel !== "email" && row.channel !== "telegram") continue;
      const result = await connection.execute(
        `UPDATE marathon_message_jobs SET status = 'sending' WHERE id = ? AND status = 'queued'`,
        [row.id],
      );
      if (result.affectedRows !== 1) continue;
      claimed.push({
        id: Number(row.id),
        marathonId: Number(row.marathon_id),
        userId: Number(row.user_id),
        dayNumber: Number(row.day_number),
        kind: row.kind,
        channel: row.channel,
        body: row.body,
        sendAt,
      });
    }
    return claimed;
  });
}

async function setJobStatus(id: number, status: "queued" | "sent" | "failed" | "cancelled"): Promise<void> {
  await withConn(async (connection) => {
    await connection.execute(
      `UPDATE marathon_message_jobs SET status = ? WHERE id = ?`,
      [status, id],
    );
  });
}

async function personStillWants(
  marathonId: number,
  userId: number,
  channel: TimelineChannel,
): Promise<boolean> {
  return withConn(async (connection) => {
    const rows = await connection.query<{
      email: string | null;
      telegram_chat_id: number | string | null;
      notify_email: number;
      notify_bot: number;
      notify_paused: number;
      pref_email: number | null;
      pref_telegram: number | null;
      account_chat_id: number | string | null;
      is_banned: number;
      declined: number;
    }>(
      `SELECT u.email, p.telegram_chat_id, p.notify_email, p.notify_bot, p.notify_paused,
              npref.email_on AS pref_email, npref.telegram_on AS pref_telegram,
              uta.telegram_chat_id AS account_chat_id, u.is_banned,
              IF(md.user_id IS NULL, 0, 1) AS declined
       FROM marathon_participants p
       INNER JOIN app_users u ON u.id = p.user_id
       LEFT JOIN user_channel_preferences npref
         ON npref.user_id = p.user_id AND npref.category = 'marathon'
       LEFT JOIN user_telegram_accounts uta ON uta.user_id = p.user_id
       LEFT JOIN marathon_declines md
         ON md.marathon_id = p.marathon_id AND md.user_id = p.user_id
       WHERE p.marathon_id = ? AND p.user_id = ?`,
      [marathonId, userId],
    );
    const row = rows[0];
    if (!row || flag(row.is_banned)) return false;
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
    return personNotifyChannels({
      email: row.email,
      telegramChatId: row.telegram_chat_id == null ? accountChat : String(row.telegram_chat_id),
      notifyEmail: delivery.notifyEmail,
      notifyBot: delivery.notifyBot,
      paused,
      declined: flag(row.declined),
    }).includes(channel);
  });
}

async function chatIdFor(marathonId: number, userId: number): Promise<string | null> {
  return withConn(async (connection) => {
    const rows = await connection.query<{
      telegram_chat_id: number | string | null;
      account_chat_id: number | string | null;
    }>(
      `SELECT p.telegram_chat_id, uta.telegram_chat_id AS account_chat_id
       FROM marathon_participants p
       LEFT JOIN user_telegram_accounts uta ON uta.user_id = p.user_id
       WHERE p.marathon_id = ? AND p.user_id = ?`,
      [marathonId, userId],
    );
    const row = rows[0];
    if (!row) return null;
    if (row.telegram_chat_id != null) return String(row.telegram_chat_id);
    return row.account_chat_id == null ? null : String(row.account_chat_id);
  });
}

async function emailFor(userId: number): Promise<string | null> {
  return withConn(async (connection) => {
    const rows = await connection.query<{ email: string | null }>(
      `SELECT email FROM app_users WHERE id = ?`,
      [userId],
    );
    return rows[0]?.email ?? null;
  });
}

/**
 * Sends rank (and similar) jobs whose time has come.
 * Opt-out and a later cancellation close the job without a send.
 * Quiet hours put a system Telegram job back to queued. Mail is not held.
 */
export async function deliverDueMessageJobs(now: Date, deps?: {
  holdTelegram?: (chatId: string) => Promise<boolean>;
}): Promise<void> {
  if (!process.env.DB_HOST) return;
  const jobs = await claimDueJobs(now);
  if (jobs.length === 0) return;
  const overrides = await loadOverridesSafe();
  const { quietHoldForChat } = await import("./notificationsJob");
  const hold = deps?.holdTelegram ?? quietHoldForChat;
  for (const job of jobs) {
    try {
      if (await marathonIsArchived(job.marathonId)) {
        await setJobStatus(job.id, "cancelled");
        await markNotificationOutcome({
          marathonId: job.marathonId,
          userId: job.userId,
          dayNumber: job.dayNumber,
          kind: job.kind,
          channel: job.channel,
        }, "cancelled");
        continue;
      }
      const override = findSlotOverride(overrides, job.marathonId, job.dayNumber, job.kind, job.channel);
      const allowed = await personStillWants(job.marathonId, job.userId, job.channel);
      if (override?.cancelled || !allowed) {
        await setJobStatus(job.id, "cancelled");
        await markNotificationOutcome({
          marathonId: job.marathonId,
          userId: job.userId,
          dayNumber: job.dayNumber,
          kind: job.kind,
          channel: job.channel,
        }, "cancelled");
        continue;
      }
      if (job.channel === "telegram") {
        const chatId = await chatIdFor(job.marathonId, job.userId);
        if (!chatId) {
          await setJobStatus(job.id, "cancelled");
          continue;
        }
        if (await hold(chatId)) {
          await setJobStatus(job.id, "queued");
          continue;
        }
        const bot = optionalTelegramBot();
        if (!bot) {
          await setJobStatus(job.id, "queued");
          continue;
        }
        let definitive = false;
        const paced = await sendThrottled([{ chatId, text: job.body }], {
          chatId: (item) => item.chatId,
          pace: sharedTelegramPace(),
          budgetMs: 8_000,
          send: async (item) => {
            const result = await sendTelegramMessage({ chatId: item.chatId, text: item.text }, bot.token);
            if (result.status === "sent") return { ok: true };
            if (isDefinitiveTelegramFailure({
              status: result.status,
              errorCode: result.context.errorCode,
              retryAfter: result.context.retryAfter,
            })) definitive = true;
            return { ok: false };
          },
        });
        await setJobStatus(job.id, paced.sent.length === 1 ? "sent" : definitive ? "cancelled" : "failed");
        if (paced.sent.length === 1) {
          const { claimNotification, confirmNotification } = await import("./store");
          const intent = {
            marathonId: job.marathonId,
            userId: job.userId,
            dayNumber: job.dayNumber,
            kind: job.kind as "rank",
            channel: job.channel,
          };
          if ((await claimNotification(intent)) === "claimed") await confirmNotification(intent);
        }
        continue;
      }
      const email = await emailFor(job.userId);
      if (!email) {
        await setJobStatus(job.id, "cancelled");
        continue;
      }
      const secret = process.env.MARATHON_UNSUBSCRIBE_SECRET?.trim()
        || process.env.SESSION_SECRET?.trim()
        || process.env.MARATHON_CRON_SECRET?.trim()
        || null;
      const unsub = secret
        ? absoluteUrl(
            `/api/marathon/unsubscribe?m=${job.marathonId}&u=${job.userId}&t=${unsubscribeToken(job.marathonId, job.userId, secret)}`,
          )
        : null;
      const mail = wrapMarathonMail({ rendered: job.body, unsubscribeUrl: unsub });
      const result = await sendMail({ to: email, subject: mail.subject, html: mail.html, text: mail.text });
      await setJobStatus(job.id, result.ok ? "sent" : "failed");
      if (result.ok) {
        const { claimNotification, confirmNotification } = await import("./store");
        const intent = {
          marathonId: job.marathonId,
          userId: job.userId,
          dayNumber: job.dayNumber,
          kind: job.kind as "rank",
          channel: job.channel,
        };
        if ((await claimNotification(intent)) === "claimed") await confirmNotification(intent);
      }
    } catch (error) {
      console.error("marathon message job", error);
      try {
        await setJobStatus(job.id, "failed");
      } catch (statusError) {
        console.error("marathon message job status", statusError);
      }
    }
  }
}
