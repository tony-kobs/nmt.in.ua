import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { absoluteUrl, sendMail } from "@/modules/mail/sendMail";
import { rememberDeferred } from "@/modules/telegram/outbox";
import { loadQuietHoursByChat, shouldHoldForQuietHours } from "@/modules/telegram/preferences";
import { loadTelegramConnection } from "@/modules/telegram/schema";
import { getKyivClock } from "@/modules/telegram/taskDay";
import { sendThrottled, sharedTelegramPace } from "@/modules/telegram/throttle";
import type { TelegramReply } from "@/modules/telegram/taskInteraction";
import { sendTelegramMessage } from "@/modules/telegram/transport";
import { optionalTelegramBot } from "./botLink";
import { personNotifyChannels } from "./channel";
import { dayUnlockAt, formatKyivWhen } from "./calendar";
import { shouldFinishDailyMarathon } from "./lifecycle";
import { renderCopy, renderResolved, type CopyKey, type CopyVars } from "./copy";
import { publicLeaderName, rankNoticeText, type BoardLine } from "./leaderboard";
import { marathonDayUrl, wrapMarathonMail } from "./mailCopy";
import {
  deliverNotifications,
  isDefinitiveTelegramFailure,
  planFollowUps,
  planNotifications,
  planNudges,
  planSiteDayOpens,
  unsubscribeToken,
  type NotifyIntent,
  type NotifyKind,
  type TelegramAttempt,
} from "./notifications";
import {
  decideSlot,
  findSlotOverride,
  gateIntents,
  overrideWindowOpen,
  type SlotOverride,
  type TimelineChannel,
} from "./messageTimeline";
import {
  deliverDueMessageJobs,
  enqueueMessageJob,
  loadOverridesSafe,
  markNotificationOutcome,
} from "./messageOverrides";
import {
  claimNotification,
  confirmNotification,
  finishElapsedDailyMarathons,
  listContentDayNumbers,
  loadMarathonBoard,
  loadNotifyAudience,
  releaseNotification,
  type NotifyAudienceMarathon,
} from "./store";

export function unsubscribeSecret(): string | null {
  return (
    process.env.MARATHON_UNSUBSCRIBE_SECRET?.trim() ||
    process.env.SESSION_SECRET?.trim() ||
    process.env.MARATHON_CRON_SECRET?.trim() ||
    null
  );
}

export function isMarathonCronAuthorized(header: string | null): boolean {
  const secret = process.env.MARATHON_CRON_SECRET?.trim();
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const provided = header.slice("Bearer ".length);
  if (!provided) return false;
  const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();
  return timingSafeEqual(digest(provided), digest(secret));
}

/** Proactive Telegram only. A lookup failure does not hold the send. */
export async function quietHoldForChat(chatId: string, now = new Date()): Promise<boolean> {
  let connection: Awaited<ReturnType<typeof loadTelegramConnection>> | undefined;
  try {
    connection = await loadTelegramConnection();
    const map = await loadQuietHoursByChat(connection, [chatId]);
    const hour = getKyivClock(Math.floor(now.getTime() / 1000)).hour;
    return shouldHoldForQuietHours(map.get(chatId), hour, "system");
  } catch (error) {
    console.error("telegram quiet hours", error);
    return false;
  } finally {
    connection?.release();
  }
}

function kindKey(kind: NotifyKind): CopyKey {
  if (kind === "day_open") return "notify_day_open";
  if (kind === "reminder") return "notify_reminder";
  if (kind === "tomorrow") return "notify_tomorrow";
  if (kind === "final") return "notify_final";
  return "rank_nudge";
}

type Delivery = {
  intent: NotifyIntent;
  email: string | null;
  chatId: string | null;
  subject: string;
  text: string;
  html: string;
};

function postponedExtras(
  marathon: NotifyAudienceMarathon,
  overrides: SlotOverride[],
  now: Date,
): NotifyIntent[] {
  const days = marathon.contentDayNumbers;
  const last = days.length > 0 ? Math.max(...days) : 0;
  const known = new Set(days);
  const extras: NotifyIntent[] = [];
  for (const override of overrides) {
    if (override.marathonId != null && override.marathonId !== marathon.marathonId) continue;
    if (!override.sendAt || override.cancelled) continue;
    if (!overrideWindowOpen(override.sendAt, now)) continue;
    if (override.kind === "rank") continue;
    if (override.channel !== "email" && override.channel !== "telegram") continue;
    const dayNumber = override.dayNumber;
    const kind = override.kind;
    if (kind !== "day_open" && kind !== "reminder" && kind !== "nudge" && kind !== "tomorrow" && kind !== "final") {
      continue;
    }
    if (kind === "final") {
      if (dayNumber !== last) continue;
    } else if (!known.has(dayNumber)) continue;
    for (const person of marathon.people) {
      if (!personNotifyChannels(person).includes(override.channel)) continue;
      const done = person.completedDayNumbers;
      if (kind === "tomorrow") {
        if (!done.includes(dayNumber - 1)) continue;
      } else if (kind === "final") {
        if (!done.includes(last)) continue;
      } else if (done.includes(dayNumber)) continue;
      extras.push({
        marathonId: marathon.marathonId,
        userId: person.userId,
        dayNumber,
        kind,
        channel: override.channel,
      });
    }
  }
  return extras;
}

function renderedBody(
  marathon: NotifyAudienceMarathon,
  intent: NotifyIntent,
  vars: CopyVars,
  overrides: SlotOverride[],
): string {
  const override = findSlotOverride(overrides, intent.marathonId, intent.dayNumber, intent.kind, intent.channel);
  const custom = override?.body?.trim();
  if (custom) return renderCopy(custom, vars);
  const rawName = vars.name == null ? "" : String(vars.name);
  const name = intent.kind === "nudge" ? publicLeaderName(rawName) : rawName;
  return renderResolved(kindKey(intent.kind), marathon.copy, { ...vars, name });
}

async function buildDeliveries(
  audience: NotifyAudienceMarathon[],
  now: Date,
  secret: string | null,
  loadBoard: (marathonId: number) => Promise<BoardLine[]>,
  overrides: SlotOverride[],
): Promise<Delivery[]> {
  const deliveries: Delivery[] = [];
  for (const marathon of audience) {
    if (marathon.status != null && marathon.status !== "active") continue;
    if (shouldFinishDailyMarathon(now, marathon)) continue;
    const dayNumbers = marathon.contentDayNumbers;
    if (dayNumbers.length === 0) continue;
    const board = await loadBoard(marathon.marathonId);
    const standing = new Map(board.map((row) => [row.userId, row]));
    const schedule = {
      reminderHour: marathon.reminderHour,
      nudgeFrom: marathon.nudgeFrom,
      nudgeUntil: marathon.nudgeUntil,
      dayNumbers,
    };
    const natural = [
      ...planNotifications({
        now,
        marathonId: marathon.marathonId,
        startDate: marathon.startDate,
        unlockHour: marathon.unlockHour,
        daysCount: marathon.daysCount,
        reminderHour: schedule.reminderHour,
        dayNumbers: schedule.dayNumbers,
        people: marathon.people,
      }),
      ...planFollowUps({
        marathonId: marathon.marathonId,
        daysCount: marathon.daysCount,
        dayNumbers: schedule.dayNumbers,
        people: marathon.people,
      }),
      ...planNudges({
        now,
        marathonId: marathon.marathonId,
        startDate: marathon.startDate,
        unlockHour: marathon.unlockHour,
        daysCount: marathon.daysCount,
        nudgeFrom: schedule.nudgeFrom,
        nudgeUntil: schedule.nudgeUntil,
        dayNumbers: schedule.dayNumbers,
        people: marathon.people,
      }),
    ];
    const intents = gateIntents(
      natural,
      overrides,
      now,
      postponedExtras(marathon, overrides, now),
    );
    for (const intent of intents) {
      const person = marathon.people.find((item) => item.userId === intent.userId);
      if (!person) continue;
      const topic = marathon.topics[intent.dayNumber] ?? `День ${intent.dayNumber}`;
      const dayUrl = intent.kind === "final"
        ? absoluteUrl(`/marathon/${encodeURIComponent(marathon.slug)}/final`)
        : marathonDayUrl(marathon.slug, intent.dayNumber);
      let unlockLabel = "";
      if (intent.kind === "tomorrow" || intent.kind === "day_open") {
        unlockLabel = formatKyivWhen(
          dayUnlockAt({
            startDate: marathon.startDate,
            unlockHour: marathon.unlockHour,
            dayNumber: intent.dayNumber,
          }),
          "uk-UA",
        );
      }
      const row = standing.get(person.userId);
      const place = row?.place ?? Math.max(board.length, 1);
      const rendered = renderedBody(marathon, intent, {
        name: person.displayName,
        day: intent.dayNumber,
        topic,
        unlock_time: unlockLabel,
        link: dayUrl,
        place,
        prev_place: row?.prevPlace ?? place,
        delta: row?.prevPlace == null ? 0 : Math.abs(row.prevPlace - place),
        total: row?.points ?? 0,
      }, overrides);
      const unsub = secret
        ? absoluteUrl(
            `/api/marathon/unsubscribe?m=${marathon.marathonId}&u=${person.userId}&t=${unsubscribeToken(marathon.marathonId, person.userId, secret)}`,
          )
        : null;
      const mail = wrapMarathonMail({ rendered, unsubscribeUrl: unsub });
      deliveries.push({
        intent,
        email: person.email,
        chatId: person.telegramChatId,
        subject: mail.subject,
        text: intent.channel === "telegram" ? rendered : mail.text,
        html: mail.html,
      });
    }
  }
  return deliveries;
}

/**
 * Claim rule for a send that must also enqueue a follow-up.
 * A failed enqueue stays unconfirmed so the next cron can retry.
 * A definitive Telegram failure has nowhere to deliver, so it is closed.
 */
export function dayOpenDeliveryOk(attempt: TelegramAttempt, queued: boolean): boolean {
  if (attempt === "definitive") return true;
  if (attempt !== "sent") return false;
  return queued;
}

/** Cron opens the day with one short note and a button. The day itself waits for «Почати». */
export function dayOpenPrompt(input: {
  chatId: string;
  text: string;
  dayNumber: number;
  beginLabel: string;
}): TelegramReply {
  const label = input.beginLabel.trim().slice(0, 64) || "Почати";
  return {
    chatId: input.chatId,
    text: input.text,
    trigger: "system",
    schedule: { dayNumber: input.dayNumber, kind: "day_open" },
    replyMarkup: { inline_keyboard: [[{ text: label, callback_data: "mh:today" }]] },
  };
}

async function classifyTelegramSend(chatId: string, text: string): Promise<TelegramAttempt> {
  const bot = optionalTelegramBot();
  if (!bot) return "retry";
  let definitive = false;
  const paced = await sendThrottled([{ chatId, text }], {
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
      return { ok: false, ...(result.context.retryAfter != null ? { retryAfter: result.context.retryAfter } : {}) };
    },
  });
  if (paced.sent.length === 1) return "sent";
  if (definitive && paced.deferred.length === 0) return "definitive";
  return "retry";
}

export async function runMarathonNotifications(deps: {
  now?: () => Date;
  load?: () => Promise<NotifyAudienceMarathon[]>;
  claim?: typeof claimNotification;
  release?: typeof releaseNotification;
  confirm?: typeof confirmNotification;
  sendEmail?: (input: { to: string; subject: string; html: string; text: string }) => Promise<boolean>;
  sendTelegram?: (chatId: string, text: string) => Promise<boolean | "definitive">;
  /** When set, replaces the quiet-hours lookup. True means do not send this chat yet. */
  holdTelegram?: (chatId: string) => Promise<boolean>;
  /** Production queues the short day-open note. Tests can capture it instead. */
  enqueueTelegram?: typeof rememberDeferred;
  telegramEnabled?: boolean;
  secret?: string | null;
  loadBoard?: (marathonId: number) => Promise<BoardLine[]>;
  /** Unit tests skip the in-site bell, which needs the database. */
  skipSiteDay?: boolean;
  /** When set, skips the database. Production loads marathon_message_overrides. */
  overrides?: SlotOverride[];
} = {}): Promise<{ sent: number; skipped: number; failed: number }> {
  const now = deps.now?.() ?? new Date();
  if (!deps.load && process.env.DB_HOST) {
    try {
      await deliverDueMessageJobs(now);
    } catch (error) {
      console.error("marathon message jobs", error);
    }
  }
  if (!deps.load) {
    try {
      await finishElapsedDailyMarathons(now);
    } catch (error) {
      console.error("marathon finish elapsed", error);
    }
  }
  const audience = await (deps.load ?? loadNotifyAudience)();
  if (!deps.skipSiteDay) {
    try {
      await deliverSiteDayNotifications(audience, now);
    } catch (error) {
      console.error("marathon site day", error);
    }
  }
  const secret = deps.secret === undefined ? unsubscribeSecret() : deps.secret;
  const telegramEnabled = deps.telegramEnabled ?? Boolean(optionalTelegramBot());
  const overrides = deps.overrides ?? await loadOverridesSafe();
  const deliveries = (await buildDeliveries(
    audience,
    now,
    secret,
    deps.loadBoard ?? loadMarathonBoard,
    overrides,
  )).filter(
    (item) => item.intent.channel === "email" || telegramEnabled,
  );
  const byKey = new Map(deliveries.map((item) => [intentKey(item.intent), item]));
  const sendEmail = deps.sendEmail ?? (async (input) => {
    const result = await sendMail(input);
    return result.ok;
  });
  const sendTelegram = deps.sendTelegram ?? (async (chatId, text) => classifyTelegramSend(chatId, text));
  const holdTelegram = deps.holdTelegram ?? ((chatId: string) => quietHoldForChat(chatId, now));
  const claim = deps.claim ?? claimNotification;
  const release = deps.release ?? releaseNotification;
  const confirm = deps.confirm ?? (deps.claim ? undefined : confirmNotification);
  const audienceById = new Map(audience.map((item) => [item.marathonId, item]));
  return deliverNotifications(
    deliveries.map((item) => item.intent),
    {
      claim,
      release,
      confirm,
      send: async (intent) => {
        const item = byKey.get(intentKey(intent));
        if (!item) return false;
        const decision = decideSlot(
          findSlotOverride(overrides, intent.marathonId, intent.dayNumber, intent.kind, intent.channel),
          now,
        );
        if (decision === "cancel") {
          await markNotificationOutcome(intent, "cancelled");
          return "skip";
        }
        if (decision === "wait") return "defer";
        if (intent.channel === "email") {
          if (!item.email) return false;
          return sendEmail({
            to: item.email,
            subject: item.subject,
            html: item.html,
            text: item.text,
          });
        }
        if (item.chatId && await holdTelegram(item.chatId)) return "defer";
        let attempt: TelegramAttempt;
        if (!item.chatId) {
          attempt = "definitive";
        } else if (intent.kind === "day_open" && !deps.sendTelegram) {
          const marathon = audienceById.get(intent.marathonId);
          if (!marathon) {
            attempt = "retry";
          } else {
            try {
              const prompt = dayOpenPrompt({
                chatId: item.chatId,
                text: item.text,
                dayNumber: intent.dayNumber,
                beginLabel: renderResolved("bot_btn_begin", marathon.copy, { day: intent.dayNumber }).slice(0, 64),
              });
              await (deps.enqueueTelegram ?? rememberDeferred)([prompt], "system", marathon.marathonId);
              return true;
            } catch (error) {
              console.error("marathon day open", error);
              return false;
            }
          }
        } else {
          const sent = await sendTelegram(item.chatId, item.text);
          attempt = sent === true || sent === "sent" ? "sent" : sent === "definitive" ? "definitive" : "retry";
        }
        return attempt === "sent" || attempt === "definitive";
      },
    },
  );
}

async function deliverSiteDayNotifications(
  audience: NotifyAudienceMarathon[],
  now: Date,
): Promise<void> {
  const { notifyUser } = await import("@/modules/notifications/store");
  for (const marathon of audience) {
    if (marathon.status != null && marathon.status !== "active") continue;
    if (shouldFinishDailyMarathon(now, marathon)) continue;
    const opens = planSiteDayOpens({
      now,
      startDate: marathon.startDate,
      unlockHour: marathon.unlockHour,
      daysCount: marathon.daysCount,
      dayNumbers: marathon.contentDayNumbers,
      people: marathon.people,
    });
    for (const open of opens) {
      const topic = marathon.topics[open.dayNumber];
      const topicLine = topic ? `: ${topic}` : "";
      await notifyUser({
        userId: open.userId,
        kind: "marathon.day_open",
        title: `Відкрито день ${open.dayNumber}`,
        body: `У марафоні «${marathon.title}» відкрився день ${open.dayNumber}${topicLine}.`,
        link: `/marathon/${marathon.slug}/day/${open.dayNumber}`,
        once: true,
      });
    }
  }
}

function intentKey(intent: NotifyIntent): string {
  return `${intent.marathonId}:${intent.userId}:${intent.dayNumber}:${intent.kind}:${intent.channel}`;
}

/** Right after a review: tomorrow's topic, or the final note. Idempotent via claim. */
export async function sendCompletedDayFollowUp(input: {
  marathonId: number;
  slug: string;
  title: string;
  startDate: string;
  unlockHour: string;
  daysCount: number;
  completedDay: number;
  topics: Record<number, string>;
  copy: NotifyAudienceMarathon["copy"];
  person: NotifyAudienceMarathon["people"][number];
  /** The bot reply already contains the text, so do not push it again. */
  skipTelegram?: boolean;
  /** Test hook. Production reads the account's quiet hours. */
  holdTelegram?: (chatId: string) => Promise<boolean>;
  now?: Date;
  slotOverrides?: SlotOverride[];
}): Promise<{ sent: number; skipped: number; failed: number }> {
  void input.title;
  const now = input.now ?? new Date();
  const secret = unsubscribeSecret();
  const dayNumbers = await listContentDayNumbers(input.marathonId);
  const person = { ...input.person, completedDayNumbers: [input.completedDay] };
  const planned = planFollowUps({
    marathonId: input.marathonId,
    daysCount: input.daysCount,
    dayNumbers,
    people: [person],
  });
  const overrides = input.slotOverrides ?? await loadOverridesSafe(input.marathonId);
  const course: NotifyAudienceMarathon = {
    marathonId: input.marathonId,
    slug: input.slug,
    title: input.title,
    startDate: input.startDate,
    unlockHour: input.unlockHour,
    reminderHour: "19:00",
    nudgeFrom: 10,
    nudgeUntil: 21,
    daysCount: input.daysCount,
    contentDayNumbers: dayNumbers,
    topics: input.topics,
    copy: input.copy,
    people: [person],
  };
  if (input.skipTelegram) {
    for (const intent of planned.filter((item) => item.channel === "telegram")) {
      const decision = decideSlot(
        findSlotOverride(overrides, intent.marathonId, intent.dayNumber, intent.kind, intent.channel),
        now,
      );
      if (decision === "wait") continue;
      try {
        if ((await claimNotification(intent)) !== "claimed") continue;
        if (decision === "cancel") await markNotificationOutcome(intent, "cancelled");
        await confirmNotification(intent);
      } catch (error) {
        console.error("marathon follow-up claim", error);
      }
    }
  }
  const gated = gateIntents(planned, overrides, now, postponedExtras(course, overrides, now));
  const intents = gated.filter((item) => !(input.skipTelegram && item.channel === "telegram"));
  const deliveries: Delivery[] = [];
  for (const intent of intents) {
    const topic = input.topics[intent.dayNumber] ?? `День ${intent.dayNumber}`;
    const dayUrl = intent.kind === "final"
      ? absoluteUrl(`/marathon/${encodeURIComponent(input.slug)}/final`)
      : marathonDayUrl(input.slug, intent.dayNumber);
    const unlockLabel = formatKyivWhen(
      dayUnlockAt({
        startDate: input.startDate,
        unlockHour: input.unlockHour,
        dayNumber: intent.dayNumber,
      }),
      "uk-UA",
    );
    const rendered = renderedBody(course, intent, {
      name: input.person.displayName,
      day: intent.dayNumber,
      topic,
      unlock_time: unlockLabel,
      link: dayUrl,
    }, overrides);
    const unsub = secret
      ? absoluteUrl(
          `/api/marathon/unsubscribe?m=${input.marathonId}&u=${input.person.userId}&t=${unsubscribeToken(input.marathonId, input.person.userId, secret)}`,
        )
      : null;
    const mail = wrapMarathonMail({ rendered, unsubscribeUrl: unsub });
    deliveries.push({
      intent,
      email: input.person.email,
      chatId: input.person.telegramChatId,
      subject: mail.subject,
      text: intent.channel === "telegram" ? rendered : mail.text,
      html: mail.html,
    });
  }
  const telegramEnabled = Boolean(optionalTelegramBot());
  const holdTelegram = input.holdTelegram ?? quietHoldForChat;
  const ready = deliveries.filter((item) => item.intent.channel === "email" || telegramEnabled);
  const byKey = new Map(ready.map((item) => [intentKey(item.intent), item]));
  return deliverNotifications(
    ready.map((item) => item.intent),
    {
      claim: claimNotification,
      release: releaseNotification,
      confirm: confirmNotification,
      send: async (intent) => {
        const item = byKey.get(intentKey(intent));
        if (!item) return false;
        const decision = decideSlot(
          findSlotOverride(overrides, intent.marathonId, intent.dayNumber, intent.kind, intent.channel),
          now,
        );
        if (decision === "cancel") {
          await markNotificationOutcome(intent, "cancelled");
          return "skip";
        }
        if (decision === "wait") return "defer";
        if (intent.channel === "email") {
          if (!item.email) return false;
          const result = await sendMail({
            to: item.email,
            subject: item.subject,
            html: item.html,
            text: item.text,
          });
          return result.ok;
        }
        if (item.chatId && await holdTelegram(item.chatId)) return "defer";
        const attempt = item.chatId
          ? await classifyTelegramSend(item.chatId, item.text)
          : "definitive";
        return attempt === "sent" || attempt === "definitive";
      },
    },
  );
}

/** Stats after a fresh day submit. The bot reply already carries the text when `skipTelegram` is set. */
export async function sendRankNotice(input: {
  marathonId: number;
  slug: string;
  copy: NotifyAudienceMarathon["copy"];
  person: NotifyAudienceMarathon["people"][number];
  dayNumber: number;
  place: number;
  prevPlace: number | null;
  points: number;
  skipTelegram?: boolean;
  /** Test hook. Production reads the account's quiet hours. */
  holdTelegram?: (chatId: string) => Promise<boolean>;
  enqueueTelegram?: typeof rememberDeferred;
  now?: Date;
  slotOverrides?: SlotOverride[];
  enqueueJob?: (job: {
    marathonId: number;
    userId: number;
    dayNumber: number;
    kind: string;
    channel: TimelineChannel;
    body: string;
    sendAt: Date;
  }) => Promise<void>;
}): Promise<string> {
  const now = input.now ?? new Date();
  const link = marathonDayUrl(input.slug, input.dayNumber);
  const rendered = rankNoticeText(input.copy, {
    name: input.person.displayName,
    place: input.place,
    prevPlace: input.prevPlace,
    points: input.points,
    day: input.dayNumber,
    link,
  });
  const overrides = input.slotOverrides ?? await loadOverridesSafe(input.marathonId);
  const vars = {
    name: input.person.displayName,
    day: input.dayNumber,
    topic: "",
    link,
    place: input.place,
    prev_place: input.prevPlace ?? input.place,
    delta: input.prevPlace == null ? 0 : Math.abs(input.prevPlace - input.place),
    total: input.points,
  };
  const textFor = (channel: TimelineChannel) => {
    const custom = findSlotOverride(overrides, input.marathonId, input.dayNumber, "rank", channel)?.body?.trim();
    return custom ? renderCopy(custom, vars) : rendered;
  };
  const secret = unsubscribeSecret();
  const unsub = secret
    ? absoluteUrl(
        `/api/marathon/unsubscribe?m=${input.marathonId}&u=${input.person.userId}&t=${unsubscribeToken(input.marathonId, input.person.userId, secret)}`,
      )
    : null;
  const channels = personNotifyChannels(input.person);
  const queueJob = input.enqueueJob ?? enqueueMessageJob;
  if (channels.includes("email") && input.person.email) {
    const emailText = textFor("email");
    const decision = decideSlot(
      findSlotOverride(overrides, input.marathonId, input.dayNumber, "rank", "email"),
      now,
    );
    try {
      if (decision === "cancel") {
        await markNotificationOutcome({
          marathonId: input.marathonId,
          userId: input.person.userId,
          dayNumber: input.dayNumber,
          kind: "rank",
          channel: "email",
        }, "cancelled");
      } else if (decision === "wait") {
        const sendAt = findSlotOverride(overrides, input.marathonId, input.dayNumber, "rank", "email")?.sendAt;
        if (sendAt) {
          await queueJob({
            marathonId: input.marathonId,
            userId: input.person.userId,
            dayNumber: input.dayNumber,
            kind: "rank",
            channel: "email",
            body: emailText,
            sendAt,
          });
        }
      } else {
        const mail = wrapMarathonMail({ rendered: emailText, unsubscribeUrl: unsub });
        await sendMail({
          to: input.person.email,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
        });
      }
    } catch (error) {
      console.error("marathon rank mail", error);
    }
  }
  let shown = rendered;
  if (channels.includes("telegram") && input.person.telegramChatId) {
    const chatId = input.person.telegramChatId;
    const telegramText = textFor("telegram");
    const decision = decideSlot(
      findSlotOverride(overrides, input.marathonId, input.dayNumber, "rank", "telegram"),
      now,
    );
    shown = telegramText;
    try {
      if (decision === "cancel") {
        shown = "";
        await markNotificationOutcome({
          marathonId: input.marathonId,
          userId: input.person.userId,
          dayNumber: input.dayNumber,
          kind: "rank",
          channel: "telegram",
        }, "cancelled");
      } else if (decision === "wait") {
        shown = "";
        const sendAt = findSlotOverride(overrides, input.marathonId, input.dayNumber, "rank", "telegram")?.sendAt;
        if (sendAt) {
          await queueJob({
            marathonId: input.marathonId,
            userId: input.person.userId,
            dayNumber: input.dayNumber,
            kind: "rank",
            channel: "telegram",
            body: telegramText,
            sendAt,
          });
        }
      } else if (!input.skipTelegram) {
        const hold = input.holdTelegram ?? quietHoldForChat;
        if (await hold(chatId)) {
          await (input.enqueueTelegram ?? rememberDeferred)(
            [{
              chatId,
              text: telegramText,
              trigger: "system",
              schedule: { dayNumber: input.dayNumber, kind: "rank" },
            }],
            "system",
            input.marathonId,
          );
        } else {
          await classifyTelegramSend(chatId, telegramText);
        }
      }
    } catch (error) {
      console.error("marathon rank telegram", error);
    }
  }
  return shown;
}
