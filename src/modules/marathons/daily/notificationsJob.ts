import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { absoluteUrl, sendMail } from "@/modules/mail/sendMail";
import { piecesToReplies } from "@/modules/telegram/deliver";
import { rememberDeferred } from "@/modules/telegram/outbox";
import { sendThrottled, sharedTelegramPace } from "@/modules/telegram/throttle";
import { sendTelegramMessage } from "@/modules/telegram/transport";
import { optionalTelegramBot } from "./botLink";
import { personNotifyChannels } from "./channel";
import { dayUnlockAt, formatKyivWhen } from "./calendar";
import { shouldFinishDailyMarathon } from "./lifecycle";
import { renderResolved, resolveCopy, type CopyKey } from "./copy";
import { publicLeaderName, rankNoticeText, type BoardLine } from "./leaderboard";
import { expandSources, materialSources } from "./telegramContent";
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
  claimNotification,
  confirmNotification,
  finishElapsedDailyMarathons,
  listContentDayNumbers,
  listDays,
  listMaterials,
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

async function buildDeliveries(
  audience: NotifyAudienceMarathon[],
  now: Date,
  secret: string | null,
  loadBoard: (marathonId: number) => Promise<BoardLine[]>,
): Promise<Delivery[]> {
  const deliveries: Delivery[] = [];
  for (const marathon of audience) {
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
    const intents = [
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
      const rendered = renderResolved(kindKey(intent.kind), marathon.copy, {
        name: intent.kind === "nudge" ? publicLeaderName(person.displayName) : person.displayName,
        day: intent.dayNumber,
        topic,
        unlock_time: unlockLabel,
        link: dayUrl,
        place,
        prev_place: row?.prevPlace ?? place,
        delta: row?.prevPlace == null ? 0 : Math.abs(row.prevPlace - place),
        total: row?.points ?? 0,
      });
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
 * Queues the day_open announcement and the whole day content in the outbox, in order.
 * Returns false when nothing could be queued, so the claim is released and cron retries.
 * The outbox drain sends, retries and falls back per piece; one bad image no longer drops the day.
 */
async function queueOpenedDay(
  marathon: NotifyAudienceMarathon,
  userId: number,
  dayNumber: number,
  chatId: string,
  announcement: string,
  includeAnnouncement = true,
): Promise<boolean> {
  const bot = optionalTelegramBot();
  if (!bot) return false;
  const days = await listDays(marathon.marathonId);
  const day = days.find((item) => item.dayNumber === dayNumber);
  const announce = { chatId, text: announcement };
  if (!day) {
    if (!includeAnnouncement) return true;
    await rememberDeferred([announce]);
    return true;
  }
  const materials = await listMaterials(day.id);
  const label = resolveCopy("bot_to_tasks", marathon.copy).slice(0, 64);
  const sources = [
    ...(day.introText?.trim() ? [{ text: day.introText.trim(), rich: true as const }] : []),
    ...materials.flatMap((material) => materialSources(material)),
    { text: label, buttons: [{ text: label, data: `mh:mat:${day.dayNumber}` }] },
  ];
  const replies = piecesToReplies(chatId, expandSources(sources));
  const last = replies[replies.length - 1];
  if (last) {
    last.materialsViewed = { marathonId: marathon.marathonId, userId, dayId: day.id };
  }
  const queued = includeAnnouncement ? [announce, ...replies] : replies;
  if (queued.length === 0) return true;
  await rememberDeferred(queued);
  return true;
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
  telegramEnabled?: boolean;
  secret?: string | null;
  loadBoard?: (marathonId: number) => Promise<BoardLine[]>;
} = {}): Promise<{ sent: number; skipped: number; failed: number }> {
  const now = deps.now?.() ?? new Date();
  if (!deps.load) {
    try {
      await finishElapsedDailyMarathons(now);
    } catch (error) {
      console.error("marathon finish elapsed", error);
    }
  }
  const audience = await (deps.load ?? loadNotifyAudience)();
  try {
    await deliverSiteDayNotifications(audience, now);
  } catch (error) {
    console.error("marathon site day", error);
  }
  const secret = deps.secret === undefined ? unsubscribeSecret() : deps.secret;
  const telegramEnabled = deps.telegramEnabled ?? Boolean(optionalTelegramBot());
  const deliveries = (await buildDeliveries(
    audience,
    now,
    secret,
    deps.loadBoard ?? loadMarathonBoard,
  )).filter(
    (item) => item.intent.channel === "email" || telegramEnabled,
  );
  const byKey = new Map(deliveries.map((item) => [intentKey(item.intent), item]));
  const sendEmail = deps.sendEmail ?? (async (input) => {
    const result = await sendMail(input);
    return result.ok;
  });
  const sendTelegram = deps.sendTelegram ?? (async (chatId, text) => classifyTelegramSend(chatId, text));
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
        if (intent.channel === "email") {
          if (!item.email) return false;
          return sendEmail({
            to: item.email,
            subject: item.subject,
            html: item.html,
            text: item.text,
          });
        }
        let attempt: TelegramAttempt;
        if (!item.chatId) {
          attempt = "definitive";
        } else if (intent.kind === "day_open" && !deps.sendTelegram) {
          const marathon = audienceById.get(intent.marathonId);
          if (!marathon) {
            attempt = "retry";
          } else {
            attempt = await classifyTelegramSend(item.chatId, item.text);
            if (attempt === "sent") {
              try {
                await queueOpenedDay(
                  marathon,
                  intent.userId,
                  intent.dayNumber,
                  item.chatId,
                  item.text,
                  false,
                );
              } catch (error) {
                console.error("marathon day content", error);
              }
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
}): Promise<{ sent: number; skipped: number; failed: number }> {
  void input.title;
  const secret = unsubscribeSecret();
  const dayNumbers = await listContentDayNumbers(input.marathonId);
  const planned = planFollowUps({
    marathonId: input.marathonId,
    daysCount: input.daysCount,
    dayNumbers,
    people: [{ ...input.person, completedDayNumbers: [input.completedDay] }],
  });
  if (input.skipTelegram) {
    for (const intent of planned.filter((item) => item.channel === "telegram")) {
      try {
        if ((await claimNotification(intent)) === "claimed") await confirmNotification(intent);
      } catch (error) {
        console.error("marathon follow-up claim", error);
      }
    }
  }
  const intents = planned.filter((item) => !(input.skipTelegram && item.channel === "telegram"));
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
    const rendered = renderResolved(kindKey(intent.kind), input.copy, {
      name: input.person.displayName,
      day: intent.dayNumber,
      topic,
      unlock_time: unlockLabel,
      link: dayUrl,
    });
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
}): Promise<string> {
  const link = marathonDayUrl(input.slug, input.dayNumber);
  const rendered = rankNoticeText(input.copy, {
    name: input.person.displayName,
    place: input.place,
    prevPlace: input.prevPlace,
    points: input.points,
    day: input.dayNumber,
    link,
  });
  const secret = unsubscribeSecret();
  const unsub = secret
    ? absoluteUrl(
        `/api/marathon/unsubscribe?m=${input.marathonId}&u=${input.person.userId}&t=${unsubscribeToken(input.marathonId, input.person.userId, secret)}`,
      )
    : null;
  const mail = wrapMarathonMail({ rendered, unsubscribeUrl: unsub });
  const channels = personNotifyChannels(input.person);
  if (channels.includes("email") && input.person.email) {
    try {
      await sendMail({
        to: input.person.email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      });
    } catch (error) {
      console.error("marathon rank mail", error);
    }
  }
  if (channels.includes("telegram") && !input.skipTelegram && input.person.telegramChatId) {
    try {
      await classifyTelegramSend(input.person.telegramChatId, rendered);
    } catch (error) {
      console.error("marathon rank telegram", error);
    }
  }
  return rendered;
}
