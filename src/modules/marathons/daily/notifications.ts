import { createHmac, timingSafeEqual } from "node:crypto";
import {
  DAY_OPEN_NOTIFY_WINDOW_MS,
  dayUnlockAt,
  kyivDateIso,
  kyivHour,
  reminderAt,
} from "./calendar";

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
  completedDayNumbers: number[];
};

export function planNotifications(input: {
  now: Date;
  marathonId: number;
  startDate: string;
  unlockHour: string;
  daysCount: number;
  people: NotifyPerson[];
}): NotifyIntent[] {
  const intents: NotifyIntent[] = [];
  const nowMs = input.now.getTime();
  const today = kyivDateIso(input.now);
  for (let dayNumber = 1; dayNumber <= input.daysCount; dayNumber += 1) {
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
        if (person.notifyEmail && person.email) {
          intents.push({
            marathonId: input.marathonId,
            userId: person.userId,
            dayNumber,
            kind,
            channel: "email",
          });
        }
        if (person.notifyBot && person.telegramChatId) {
          intents.push({
            marathonId: input.marathonId,
            userId: person.userId,
            dayNumber,
            kind,
            channel: "telegram",
          });
        }
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
  people: NotifyPerson[];
}): NotifyIntent[] {
  const hour = kyivHour(input.now);
  if (hour < NUDGE_HOUR_FROM || hour >= NUDGE_HOUR_UNTIL) return [];
  const intents: NotifyIntent[] = [];
  const nowMs = input.now.getTime();
  for (let dayNumber = 1; dayNumber <= input.daysCount; dayNumber += 1) {
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
      if (person.notifyEmail && person.email) {
        intents.push({
          marathonId: input.marathonId,
          userId: person.userId,
          dayNumber,
          kind: "nudge",
          channel: "email",
        });
      }
      if (person.notifyBot && person.telegramChatId) {
        intents.push({
          marathonId: input.marathonId,
          userId: person.userId,
          dayNumber,
          kind: "nudge",
          channel: "telegram",
        });
      }
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
  people: NotifyPerson[];
}): NotifyIntent[] {
  const intents: NotifyIntent[] = [];
  for (const person of input.people) {
    const done = new Set(person.completedDayNumbers);
    const queue: Array<{ dayNumber: number; kind: NotifyKind }> = [];
    for (let day = 1; day < input.daysCount; day += 1) {
      if (done.has(day)) queue.push({ dayNumber: day + 1, kind: "tomorrow" });
    }
    if (input.daysCount > 0 && done.has(input.daysCount)) {
      queue.push({ dayNumber: input.daysCount, kind: "final" });
    }
    for (const item of queue) {
      if (person.notifyEmail && person.email) {
        intents.push({
          marathonId: input.marathonId,
          userId: person.userId,
          dayNumber: item.dayNumber,
          kind: item.kind,
          channel: "email",
        });
      }
      if (person.notifyBot && person.telegramChatId) {
        intents.push({
          marathonId: input.marathonId,
          userId: person.userId,
          dayNumber: item.dayNumber,
          kind: item.kind,
          channel: "telegram",
        });
      }
    }
  }
  return intents;
}

export async function deliverNotifications(
  intents: NotifyIntent[],
  deps: {
    claim: (intent: NotifyIntent) => Promise<"claimed" | "duplicate">;
    release: (intent: NotifyIntent) => Promise<void>;
    send: (intent: NotifyIntent) => Promise<boolean>;
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
    if (!ok) {
      await deps.release(intent);
      failed += 1;
      continue;
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
