import { createHmac, timingSafeEqual } from "node:crypto";
import {
  DAY_OPEN_NOTIFY_WINDOW_MS,
  dayUnlockAt,
  kyivDateIso,
  kyivHour,
  reminderAt,
} from "./calendar";
import { personNotifyChannels, type DeliveryChannel } from "./channel";

export type NotifyKind = "day_open" | "reminder" | "tomorrow" | "final" | "nudge";

/** A missed-day nudge goes out only inside these Kyiv hours, so night cron stays quiet. */
export const NUDGE_HOUR_FROM = 10;
export const NUDGE_HOUR_UNTIL = 21;
export type NotifyChannel = "email" | "telegram";

export type NotifyIntent = {
  marathonId: number;
  userId: number;
  dayNumber: number;
  kind: NotifyKind;
  channel: NotifyChannel;
};

export type NotifyPerson = {
  userId: number;
  email: string | null;
  telegramChatId: string | null;
  notifyEmail: boolean;
  notifyBot: boolean;
  paused?: boolean;
  declined?: boolean;
  channel?: DeliveryChannel | null;
  completedDayNumbers: number[];
};

function pushChannel(
  intents: NotifyIntent[],
  person: NotifyPerson,
  base: Omit<NotifyIntent, "channel">,
): void {
  for (const channel of personNotifyChannels(person)) {
    intents.push({ ...base, channel });
  }
}

/** In-site day-open notes. Always on for a participant who has not declined. */
export function planSiteDayOpens(input: {
  now: Date;
  startDate: string;
  unlockHour: string;
  daysCount: number;
  dayNumbers?: number[];
  people: Array<Pick<NotifyPerson, "userId" | "declined" | "completedDayNumbers">>;
}): Array<{ userId: number; dayNumber: number }> {
  const intents: Array<{ userId: number; dayNumber: number }> = [];
  const nowMs = input.now.getTime();
  for (const dayNumber of plannedDays(input.daysCount, input.dayNumbers)) {
    const unlockMs = dayUnlockAt({
      startDate: input.startDate,
      unlockHour: input.unlockHour,
      dayNumber,
    }).getTime();
    const openWindow = nowMs >= unlockMs && nowMs < unlockMs + DAY_OPEN_NOTIFY_WINDOW_MS;
    if (!openWindow) continue;
    for (const person of input.people) {
      if (person.declined) continue;
      if (person.completedDayNumbers.includes(dayNumber)) continue;
      intents.push({ userId: person.userId, dayNumber });
    }
  }
  return intents;
}

function plannedDays(daysCount: number, dayNumbers?: number[]): number[] {
  if (!dayNumbers) {
    return Array.from({ length: daysCount }, (_, index) => index + 1);
  }
  return [...new Set(dayNumbers.filter((day) => Number.isInteger(day) && day >= 1 && day <= daysCount))]
    .sort((left, right) => left - right);
}

export function planNotifications(input: {
  now: Date;
  marathonId: number;
  startDate: string;
  unlockHour: string;
  daysCount: number;
  reminderHour?: string;
  /** When set, days without a row are not announced. */
  dayNumbers?: number[];
  people: NotifyPerson[];
}): NotifyIntent[] {
  const intents: NotifyIntent[] = [];
  const nowMs = input.now.getTime();
  const today = kyivDateIso(input.now);
  for (const dayNumber of plannedDays(input.daysCount, input.dayNumbers)) {
    const unlockAt = dayUnlockAt({
      startDate: input.startDate,
      unlockHour: input.unlockHour,
      dayNumber,
    });
    const unlockMs = unlockAt.getTime();
    const dayIsToday = kyivDateIso(unlockAt) === today;
    const openWindow =
      nowMs >= unlockMs && nowMs < unlockMs + DAY_OPEN_NOTIFY_WINDOW_MS;
    const remindAt = reminderAt({
      startDate: input.startDate,
      dayNumber,
      reminderHour: input.reminderHour,
    }).getTime();
    const nextUnlock = dayUnlockAt({
      startDate: input.startDate,
      unlockHour: input.unlockHour,
      dayNumber: dayNumber + 1,
    }).getTime();
    const reminderWindow =
      dayIsToday && nowMs >= remindAt && nowMs < nextUnlock;
    if (!openWindow && !reminderWindow) continue;
    for (const person of input.people) {
      if (person.completedDayNumbers.includes(dayNumber)) continue;
      const kinds: NotifyKind[] = [];
      if (openWindow) kinds.push("day_open");
      if (reminderWindow) kinds.push("reminder");
      for (const kind of kinds) {
        pushChannel(intents, person, {
          marathonId: input.marathonId,
          userId: person.userId,
          dayNumber,
          kind,
        });
      }
    }
  }
  return intents;
}

/**
 * A day is missed once the next day's unlock has passed and this one is still open.
 * One intent per channel; `marathon_notifications` keeps a later cron from repeating it.
 * The same-day 19:00 reminder stops at the next unlock, so the two windows do not overlap.
 */
export function planNudges(input: {
  now: Date;
  marathonId: number;
  startDate: string;
  unlockHour: string;
  daysCount: number;
  nudgeFrom?: number;
  nudgeUntil?: number;
  dayNumbers?: number[];
  people: NotifyPerson[];
}): NotifyIntent[] {
  const from = input.nudgeFrom ?? NUDGE_HOUR_FROM;
  const until = input.nudgeUntil ?? NUDGE_HOUR_UNTIL;
  const hour = kyivHour(input.now);
  if (hour < from || hour >= until) return [];
  const intents: NotifyIntent[] = [];
  const nowMs = input.now.getTime();
  for (const dayNumber of plannedDays(input.daysCount, input.dayNumbers)) {
    let nextUnlock = 0;
    try {
      nextUnlock = dayUnlockAt({
        startDate: input.startDate,
        unlockHour: input.unlockHour,
        dayNumber: dayNumber + 1,
      }).getTime();
    } catch {
      continue;
    }
    if (nowMs < nextUnlock) continue;
    for (const person of input.people) {
      if (person.completedDayNumbers.includes(dayNumber)) continue;
      pushChannel(intents, person, {
        marathonId: input.marathonId,
        userId: person.userId,
        dayNumber,
        kind: "nudge",
      });
    }
  }
  return intents;
}

/**
 * After a day is reviewed: announce the next day, or the final note once
 * the last day is in. Claimed rows in `marathon_notifications` keep cron
 * from sending the same note again.
 */
export function planFollowUps(input: {
  marathonId: number;
  daysCount: number;
  dayNumbers?: number[];
  people: NotifyPerson[];
}): NotifyIntent[] {
  const known = input.dayNumbers ? new Set(plannedDays(input.daysCount, input.dayNumbers)) : null;
  const last = known && known.size > 0 ? Math.max(...known) : input.daysCount;
  const intents: NotifyIntent[] = [];
  for (const person of input.people) {
    const done = new Set(person.completedDayNumbers);
    const queue: Array<{ dayNumber: number; kind: NotifyKind }> = [];
    for (let day = 1; day < last; day += 1) {
      if (known && (!known.has(day) || !known.has(day + 1))) continue;
      if (done.has(day)) queue.push({ dayNumber: day + 1, kind: "tomorrow" });
    }
    if (last > 0 && done.has(last) && (!known || known.has(last))) {
      queue.push({ dayNumber: last, kind: "final" });
    }
    for (const item of queue) {
      pushChannel(intents, person, {
        marathonId: input.marathonId,
        userId: person.userId,
        dayNumber: item.dayNumber,
        kind: item.kind,
      });
    }
  }
  return intents;
}

export type TelegramAttempt = "sent" | "retry" | "definitive";

/**
 * 400/403 without retry_after means the chat will not accept this bot
 * (blocked, deactivated, chat not found). 401/429/network stay retryable.
 */
export function isDefinitiveTelegramFailure(input: {
  status: string;
  errorCode?: number;
  retryAfter?: number;
}): boolean {
  if (input.retryAfter != null) return false;
  if (input.status !== "rejected") return false;
  return input.errorCode === 400 || input.errorCode === 403;
}

/**
 * Email is a fallback claim on channel `email`, not a second copy of a successful telegram send.
 * A transient telegram failure releases nothing here: the caller retries telegram.
 * A definitive failure confirms the email row when the letter goes out, and returns false
 * (so the telegram claim is released) when the letter itself fails and should be retried.
 * No inbox closes the telegram attempt: there is nowhere else to deliver it.
 */
export async function fallbackEmailAfterTelegram(input: {
  intent: NotifyIntent;
  email: string | null;
  attempt: TelegramAttempt;
  claim: (intent: NotifyIntent) => Promise<"claimed" | "duplicate">;
  release: (intent: NotifyIntent) => Promise<void>;
  confirm?: (intent: NotifyIntent) => Promise<void>;
  sendEmail: () => Promise<boolean>;
}): Promise<boolean> {
  if (input.attempt === "sent") return true;
  if (input.attempt !== "definitive") return false;
  if (!input.email) return true;
  const emailIntent: NotifyIntent = { ...input.intent, channel: "email" };
  const taken = await input.claim(emailIntent);
  if (taken === "duplicate") return true;
  const ok = await input.sendEmail();
  if (!ok) {
    await input.release(emailIntent);
    return false;
  }
  if (input.confirm) {
    try {
      await input.confirm(emailIntent);
    } catch (error) {
      console.error("marathon notification confirm", error);
    }
  }
  return true;
}

export async function deliverNotifications(
  intents: NotifyIntent[],
  deps: {
    claim: (intent: NotifyIntent) => Promise<"claimed" | "duplicate">;
    release: (intent: NotifyIntent) => Promise<void>;
    send: (intent: NotifyIntent) => Promise<boolean | "defer" | "skip">;
    /** Marks the claim delivered. Without it a claim is final as soon as it is taken. */
    confirm?: (intent: NotifyIntent) => Promise<void>;
  },
): Promise<{ sent: number; skipped: number; failed: number }> {
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const intent of intents) {
    const claim = await deps.claim(intent);
    if (claim === "duplicate") {
      skipped += 1;
      continue;
    }
    const ok = await deps.send(intent);
    if (ok === "defer") {
      await deps.release(intent);
      skipped += 1;
      continue;
    }
    if (ok === "skip") {
      if (deps.confirm) {
        try {
          await deps.confirm(intent);
        } catch (error) {
          console.error("marathon notification confirm", error);
        }
      }
      skipped += 1;
      continue;
    }
    if (!ok) {
      await deps.release(intent);
      failed += 1;
      continue;
    }
    if (deps.confirm) {
      try {
        await deps.confirm(intent);
      } catch (error) {
        // The message is out; a stale claim may resend it once, which beats losing it.
        console.error("marathon notification confirm", error);
      }
    }
    sent += 1;
  }
  return { sent, skipped, failed };
}

export function unsubscribeToken(
  marathonId: number,
  userId: number,
  secret: string,
): string {
  return createHmac("sha256", secret)
    .update(`${marathonId}.${userId}`)
    .digest("base64url");
}

export function verifyUnsubscribeToken(
  marathonId: number,
  userId: number,
  token: string,
  secret: string,
): boolean {
  if (!secret || !token) return false;
  const expected = unsubscribeToken(marathonId, userId, secret);
  const left = Buffer.from(token);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
