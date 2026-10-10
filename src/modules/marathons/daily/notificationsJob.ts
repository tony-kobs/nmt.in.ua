import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { absoluteUrl, sendMail } from "@/modules/mail/sendMail";
import { deliverTelegramReplies, piecesToReplies } from "@/modules/telegram/deliver";
import { rememberDeferred } from "@/modules/telegram/outbox";
import { sendThrottled, sharedTelegramPace } from "@/modules/telegram/throttle";
import { sendTelegramMessage } from "@/modules/telegram/transport";
import { optionalTelegramBot } from "./botLink";
import { dayUnlockAt, formatKyivWhen } from "./calendar";
import { renderResolved, resolveCopy, type CopyKey } from "./copy";
import { publicLeaderName, rankNoticeText, type BoardLine } from "./leaderboard";
import { expandSources, materialSources } from "./telegramContent";
import { marathonDayUrl, wrapMarathonMail } from "./mailCopy";
import {
  deliverNotifications,
  planFollowUps,
  planNotifications,
  planNudges,
  unsubscribeToken,
  type NotifyIntent,
  type NotifyKind,
} from "./notifications";
import {
  claimNotification,
  listDays,
  listMaterials,
  loadMarathonBoard,
  loadNotifyAudience,
  markMaterialsViewed,
  releaseNotification,
  type DailyMarathon,
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
    const board = await loadBoard(marathon.marathonId);
    const standing = new Map(board.map((row) => [row.userId, row]));
    const intents = [
      ...planNotifications({
        now,
        marathonId: marathon.marathonId,
        startDate: marathon.startDate,
        unlockHour: marathon.unlockHour,
        daysCount: marathon.daysCount,
        people: marathon.people,
      }),
      ...planFollowUps({
        marathonId: marathon.marathonId,
        daysCount: marathon.daysCount,
        people: marathon.people,
      }),
      ...planNudges({
        now,
        marathonId: marathon.marathonId,
        startDate: marathon.startDate,
        unlockHour: marathon.unlockHour,
        daysCount: marathon.daysCount,
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

async function pushOpenedDayContent(
  marathon: NotifyAudienceMarathon,
  userId: number,
  dayNumber: number,
  chatId: string,
): Promise<void> {
  const bot = optionalTelegramBot();
  if (!bot) return;
  const days = await listDays(marathon.marathonId);
  const day = days.find((item) => item.dayNumber === dayNumber);
  if (!day) return;
  const materials = await listMaterials(day.id);
  const label = resolveCopy("bot_to_tasks", marathon.copy).slice(0, 64);
  const sources = [
    ...(day.introText?.trim() ? [{ text: day.introText.trim(), rich: true as const }] : []),
    ...materials.flatMap((material) => materialSources(material)),
    { text: label, buttons: [{ text: label, data: `mh:mat:${day.dayNumber}` }] },
  ];
  const replies = piecesToReplies(chatId, expandSources(sources));
  const delivered = await deliverTelegramReplies(replies, bot.token, { budgetMs: 8_000 });
  if (delivered.deferred.length > 0) await rememberDeferred(delivered.deferred);
  if (delivered.sent === 0 && delivered.deferred.length === 0 && materials.length > 0) return;
  const shell = {
    id: marathon.marathonId,
    slug: marathon.slug,
    title: marathon.title,
    subject: "math",
    startDate: marathon.startDate,
    unlockHour: marathon.unlockHour,
    daysCount: marathon.daysCount,
    passThreshold: 60,
    finalCtaText: "",
    finalCtaUrl: "",
    introVideoUrl: "",
    status: "active",
  } satisfies DailyMarathon;
  await markMaterialsViewed({ marathon: shell, userId, day, now: new Date() });
}

export async function runMarathonNotifications(deps: {
  now?: () => Date;
  load?: () => Promise<NotifyAudienceMarathon[]>;
  claim?: typeof claimNotification;
  release?: typeof releaseNotification;
  sendEmail?: (input: { to: string; subject: string; html: string; text: string }) => Promise<boolean>;
  sendTelegram?: (chatId: string, text: string) => Promise<boolean>;
  telegramEnabled?: boolean;
  secret?: string | null;
  loadBoard?: (marathonId: number) => Promise<BoardLine[]>;
} = {}): Promise<{ sent: number; skipped: number; failed: number }> {
  const now = deps.now?.() ?? new Date();
  const audience = await (deps.load ?? loadNotifyAudience)();
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
  const sendTelegram = deps.sendTelegram ?? (async (chatId, text) => {
    const bot = optionalTelegramBot();
    if (!bot) return false;
    const paced = await sendThrottled([{ chatId, text }], {
      chatId: (item) => item.chatId,
      pace: sharedTelegramPace(),
      budgetMs: 8_000,
      send: async (item) => {
        const result = await sendTelegramMessage({ chatId: item.chatId, text: item.text }, bot.token);
        if (result.status === "sent") return { ok: true };
        return { ok: false, ...(result.context.retryAfter != null ? { retryAfter: result.context.retryAfter } : {}) };
      },
    });
    return paced.sent.length === 1;
  });
  const audienceById = new Map(audience.map((item) => [item.marathonId, item]));
  return deliverNotifications(
    deliveries.map((item) => item.intent),
    {
      claim: deps.claim ?? claimNotification,
      release: deps.release ?? releaseNotification,
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
        if (!item.chatId) return false;
        const sent = await sendTelegram(item.chatId, item.text);
        if (sent && intent.kind === "day_open" && !deps.sendTelegram) {
          const marathon = audienceById.get(intent.marathonId);
          if (marathon) {
            try {
              await pushOpenedDayContent(marathon, intent.userId, intent.dayNumber, item.chatId);
            } catch (error) {
              console.error("marathon day content", error);
            }
          }
        }
        return sent;
      },
    },
  );
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
  const planned = planFollowUps({
    marathonId: input.marathonId,
    daysCount: input.daysCount,
    people: [{ ...input.person, completedDayNumbers: [input.completedDay] }],
  });
  if (input.skipTelegram) {
    for (const intent of planned.filter((item) => item.channel === "telegram")) {
      try {
        await claimNotification(intent);
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
        const bot = optionalTelegramBot();
        if (!bot || !item.chatId) return false;
        const paced = await sendThrottled([{ chatId: item.chatId, text: item.text }], {
          chatId: (entry) => entry.chatId,
          pace: sharedTelegramPace(),
          budgetMs: 8_000,
          send: async (entry) => {
            const result = await sendTelegramMessage({ chatId: entry.chatId, text: entry.text }, bot.token);
            if (result.status === "sent") return { ok: true };
            return { ok: false, ...(result.context.retryAfter != null ? { retryAfter: result.context.retryAfter } : {}) };
          },
        });
        return paced.sent.length === 1;
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
  if (input.person.notifyEmail && input.person.email) {
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
  if (!input.skipTelegram && input.person.notifyBot && input.person.telegramChatId) {
    const bot = optionalTelegramBot();
    if (bot) {
      try {
        await sendThrottled([{ chatId: input.person.telegramChatId, text: rendered }], {
          chatId: (entry) => entry.chatId,
          pace: sharedTelegramPace(),
          budgetMs: 8_000,
          send: async (entry) => {
            const result = await sendTelegramMessage(
              { chatId: entry.chatId, text: entry.text },
              bot.token,
            );
            if (result.status === "sent") return { ok: true };
            return {
              ok: false,
              ...(result.context.retryAfter != null ? { retryAfter: result.context.retryAfter } : {}),
            };
          },
        });
      } catch (error) {
        console.error("marathon rank telegram", error);
      }
    }
  }
  return rendered;
}
