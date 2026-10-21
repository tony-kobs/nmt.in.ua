import { DAY_OPEN_NOTIFY_WINDOW_MS, dayUnlockAt, formatKyivWhen, kyivDateIso, kyivHour, reminderAt, zonedWallTimeToUtc, addCalendarDays } from "./calendar";
import { personNotifyChannels, type NotifyPersonFlags } from "./channel";
import { COPY_DEFAULTS, renderCopy, type CopyKey, type CopyVars } from "./copy";
import type { NotifyKind } from "./notifications";

export const TIMELINE_KINDS = ["day_open", "reminder", "nudge", "tomorrow", "final", "rank"] as const;
export type TimelineKind = (typeof TIMELINE_KINDS)[number];
export type TimelineChannel = "email" | "telegram";
export type TimelineStatus =
  | "planned"
  | "queued"
  | "postponed"
  | "quiet"
  | "sent"
  | "partial"
  | "failed"
  | "skipped"
  | "cancelled";

export type SkipCode = "opt_out" | "no_telegram" | "archived" | "unlinked";

/** Stored as-is on a failed or skipped row. The timeline prints this text. */
export const SKIP_REASON_TEXT: Record<SkipCode, string> = {
  opt_out: "відмова від сповіщень",
  no_telegram: "немає прив’язаного Telegram",
  archived: "марафон в архіві",
  unlinked: "Telegram відв’язано",
};

export type SlotOverride = {
  /** Set for rows loaded from the database. Omitted only in unit fixtures. */
  marathonId?: number;
  dayNumber: number;
  kind: string;
  channel: string;
  cancelled: boolean;
  sendAt: Date | null;
  body: string | null;
};

export type TimelinePerson = NotifyPersonFlags & {
  completedDayNumbers: number[];
};

export type LedgerCount = {
  dayNumber: number;
  kind: string;
  channel: string;
  sent: number;
  pending: number;
  failed?: number;
  sentAt?: Date | null;
  errorText?: string | null;
};

export type SlotFailure = {
  dayNumber: number;
  kind: string;
  channel: string;
  who: string;
  reason: string;
};

export type OutboxSnapshot = {
  id: number;
  status: "pending" | "sent" | "failed" | "cancelled";
  notBefore: Date | null;
  createdAt: Date;
  text: string;
  dayNumber: number | null;
  kind: string | null;
  errorText?: string | null;
  holdReason?: "quiet" | "postpone" | null;
  who?: string | null;
};

export type JobSnapshot = {
  id: number;
  userId: number;
  dayNumber: number;
  kind: string;
  channel: string;
  body: string;
  sendAt: Date;
  status: "queued" | "sending" | "sent" | "failed" | "cancelled";
  errorText?: string | null;
  holdReason?: "quiet" | "postpone" | null;
  who?: string | null;
};

export type TimelineFailure = {
  who: string;
  reason: string;
};

export type TimelineItem = {
  key: string;
  source: "schedule" | "outbox" | "job";
  dayNumber: number;
  kind: string;
  channel: TimelineChannel;
  plannedAt: string;
  effectiveAt: string;
  status: TimelineStatus;
  audience: number;
  sentCount: number;
  failedCount: number;
  /** When the slot actually left. Empty when the ledger has no sent_at. */
  sentAt: string | null;
  /** Stored error, or a skip reason. Empty for a clean plan. */
  reason: string | null;
  failures: TimelineFailure[];
  preview: string;
  /** Raw template for a schedule slot, or the stored text of one queued message. */
  template: string;
  editable: boolean;
  outboxId?: number;
  jobId?: number;
};

export type TimelineDay = {
  date: string;
  items: TimelineItem[];
};

const KIND_COPY: Record<TimelineKind, CopyKey> = {
  day_open: "notify_day_open",
  reminder: "notify_reminder",
  nudge: "rank_nudge",
  tomorrow: "notify_tomorrow",
  final: "notify_final",
  rank: "rank_same",
};

export function isTimelineKind(value: string): value is TimelineKind {
  return (TIMELINE_KINDS as readonly string[]).includes(value);
}

export function isTimelineChannel(value: string): value is TimelineChannel {
  return value === "email" || value === "telegram";
}

export function slotKey(dayNumber: number, kind: string, channel: string): string {
  return `${dayNumber}:${kind}:${channel}`;
}

export function findSlotOverride(
  overrides: SlotOverride[],
  marathonId: number,
  dayNumber: number,
  kind: string,
  channel: string,
): SlotOverride | undefined {
  const same = overrides.filter(
    (row) => row.dayNumber === dayNumber && row.kind === kind && row.channel === channel,
  );
  return same.find((row) => row.marathonId === marathonId)
    ?? same.find((row) => row.marathonId == null);
}

/** Wall clock in Europe/Kyiv. Empty or impossible values are rejected. */
export function parseKyivDateTime(date: string, time: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null;
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  if (!year || !month || !day) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (hour! > 23 || minute! > 59) return null;
  return zonedWallTimeToUtc(year, month, day, hour!, minute!);
}

export function cleanTimelineBody(value: string): string | null {
  const body = value.replace(/\r\n/g, "\n").trim();
  if (!body || body.length > 4000) return null;
  return body;
}

/** Quiet-hour and opt-out checks stay outside. This only reads the admin override. */
export function decideSlot(
  override: Pick<SlotOverride, "cancelled" | "sendAt"> | null | undefined,
  now: Date,
): "send" | "wait" | "cancel" {
  if (!override) return "send";
  if (override.cancelled) return "cancel";
  if (override.sendAt && now.getTime() < override.sendAt.getTime()) return "wait";
  return "send";
}

export function overrideWindowOpen(sendAt: Date, now: Date): boolean {
  const at = sendAt.getTime();
  const current = now.getTime();
  return current >= at && current < at + DAY_OPEN_NOTIFY_WINDOW_MS;
}

type ScheduleInput = {
  startDate: string;
  unlockHour: string;
  reminderHour: string;
  nudgeFrom: number;
  nudgeUntil: number;
  days: Array<{ dayNumber: number; topic: string }>;
};

function nudgeInstant(input: ScheduleInput, dayNumber: number): Date | null {
  const known = new Set(input.days.map((day) => day.dayNumber));
  if (!known.has(dayNumber + 1)) return null;
  let next: Date;
  try {
    next = dayUnlockAt({
      startDate: input.startDate,
      unlockHour: input.unlockHour,
      dayNumber: dayNumber + 1,
    });
  } catch {
    return null;
  }
  const date = kyivDateIso(next);
  const hour = kyivHour(next);
  const [year, month, day] = date.split("-").map(Number);
  if (hour < input.nudgeFrom) {
    return zonedWallTimeToUtc(year!, month!, day!, input.nudgeFrom, 0);
  }
  if (hour < input.nudgeUntil) return next;
  const following = addCalendarDays(date, 1);
  return zonedWallTimeToUtc(following.year, following.month, following.day, input.nudgeFrom, 0);
}

export function channelEnabled(person: TimelinePerson, channel: TimelineChannel): boolean {
  return personNotifyChannels(person).includes(channel);
}

export function audienceFor(
  people: TimelinePerson[],
  dayNumber: number,
  kind: string,
  channel: TimelineChannel,
  lastDay: number,
): number {
  return people.filter((person) => {
    if (!channelEnabled(person, channel)) return false;
    if (kind === "tomorrow") return person.completedDayNumbers.includes(dayNumber - 1);
    if (kind === "final") return person.completedDayNumbers.includes(lastDay);
    if (kind === "day_open" || kind === "reminder" || kind === "nudge" || kind === "rank") {
      return !person.completedDayNumbers.includes(dayNumber);
    }
    return true;
  }).length;
}

function previewFor(
  kind: string,
  dayNumber: number,
  topic: string,
  overrideBody: string | null,
  whenLabel: string,
  link: string,
): string {
  const vars: CopyVars = {
    name: "Учасник",
    day: dayNumber,
    topic,
    unlock_time: whenLabel,
    link,
    place: 1,
    prev_place: 2,
    delta: 1,
    total: 0,
  };
  const custom = overrideBody?.trim();
  if (custom) return renderCopy(custom, vars);
  const key = isTimelineKind(kind) ? KIND_COPY[kind] : "notify_day_open";
  return renderCopy(COPY_DEFAULTS[key], vars);
}

export type StatusInput = {
  cancelled?: boolean;
  /** Admin moved this slot or row to a new time. */
  postponed?: boolean;
  /** System quiet-hours hold. A user reply is never this. */
  quiet?: boolean;
  /** Archived course: unsent work does not go out. */
  archived?: boolean;
  skip?: SkipCode | null;
  audience: number;
  sent: number;
  pending: number;
  failed: number;
};

/**
 * One badge for a schedule slot or a single queued row.
 * A future slot with an empty audience because of the kind rules stays planned.
 * Opt-out, a missing Telegram link, and an archived course are skipped.
 */
export function deriveTimelineStatus(input: StatusInput): TimelineStatus {
  const sent = input.sent;
  const pending = input.pending;
  const failed = input.failed;
  const audience = input.audience;
  if (input.cancelled) return "cancelled";
  if (sent > 0 && failed > 0) return "partial";
  if (failed === 0 && sent > 0 && (input.archived || audience === 0 || sent >= audience)) return "sent";
  if (failed > 0 && sent === 0 && pending === 0) return "failed";
  if (input.archived && sent === 0) return "skipped";
  if (input.postponed && sent === 0 && failed === 0) return "postponed";
  if (input.quiet && sent === 0 && failed === 0) return "quiet";
  if (input.skip && sent === 0 && pending === 0 && failed === 0) return "skipped";
  if (pending > 0) return "queued";
  return "planned";
}

function itemReason(
  status: TimelineStatus,
  input: { errorText?: string | null; skip?: SkipCode | null; archived?: boolean },
): string | null {
  if (status === "failed") return input.errorText?.trim() || null;
  if (status !== "skipped") return null;
  if (input.skip) return SKIP_REASON_TEXT[input.skip];
  if (input.archived) return SKIP_REASON_TEXT.archived;
  return input.errorText?.trim() || null;
}

export function timelineEditable(status: TimelineStatus): boolean {
  return status === "planned"
    || status === "queued"
    || status === "postponed"
    || status === "quiet"
    || status === "failed";
}

export function skipCodeFromText(text: string | null | undefined): SkipCode | null {
  if (!text) return null;
  const found = (Object.entries(SKIP_REASON_TEXT) as Array<[SkipCode, string]>)
    .find(([, value]) => value === text);
  return found?.[0] ?? null;
}

/** Short reason we store. Telegram's own description is not kept. */
export function deliveryErrorText(input: {
  channel: "telegram" | "email";
  errorCode?: number | null;
  mailError?: string | null;
  invalidPayload?: boolean;
  gaveUp?: boolean;
}): string {
  if (input.invalidPayload) return "Некоректне повідомлення в черзі";
  if (input.channel === "telegram") {
    if (input.errorCode === 403) return "Telegram 403: бот заблоковано";
    if (input.errorCode != null) return `Telegram ${input.errorCode}`;
    if (input.gaveUp) return "Час очікування Telegram вичерпано";
    return "Помилка Telegram";
  }
  const mail = (input.mailError ?? "").trim();
  if (mail === "timeout" || /timed out/i.test(mail)) return "Час очікування Brevo вичерпано";
  if (mail === "bad_from") return "Помилка Brevo: некоректний відправник";
  if (mail === "missing_api_key") return "Помилка Brevo: ключ не налаштовано";
  if (mail === "brevo_error" || mail === "send_failed" || !mail) return "Помилка Brevo";
  return `Помилка Brevo: ${mail}`.slice(0, 500);
}

function kindMatches(person: TimelinePerson, dayNumber: number, kind: string, lastDay: number): boolean {
  if (kind === "tomorrow") return person.completedDayNumbers.includes(dayNumber - 1);
  if (kind === "final") return person.completedDayNumbers.includes(lastDay);
  if (kind === "day_open" || kind === "reminder" || kind === "nudge" || kind === "rank") {
    return !person.completedDayNumbers.includes(dayNumber);
  }
  return true;
}

/**
 * Skip only when nobody left can receive this channel.
 * An empty audience because the day is already done, or tomorrow's day
 * has no completers yet, stays a normal planned slot.
 */
export function scheduleSkipReason(
  people: TimelinePerson[],
  dayNumber: number,
  kind: string,
  channel: TimelineChannel,
  lastDay: number,
): SkipCode | null {
  if (people.length === 0) return null;
  const active = people.filter((person) => !person.paused && !person.declined);
  if (active.length === 0) return "opt_out";
  const inKind = active.filter((person) => kindMatches(person, dayNumber, kind, lastDay));
  if (inKind.length === 0) return null;
  if (inKind.some((person) => channelEnabled(person, channel))) return null;
  if (channel === "telegram" && inKind.some((person) => person.notifyBot && !person.telegramChatId)) {
    return "no_telegram";
  }
  return "opt_out";
}

export function buildMessageTimeline(input: {
  schedule: ScheduleInput;
  linkBase: string;
  people: TimelinePerson[];
  ledger: LedgerCount[];
  overrides: SlotOverride[];
  outbox: OutboxSnapshot[];
  jobs: JobSnapshot[];
  failures?: SlotFailure[];
  now?: Date;
  /** Archived course: keep sent history, show every other unsent row as skipped. */
  hold?: boolean;
}): TimelineDay[] {
  const days = [...input.schedule.days].sort((a, b) => a.dayNumber - b.dayNumber);
  const known = new Set(days.map((day) => day.dayNumber));
  const lastDay = days[days.length - 1]?.dayNumber ?? 0;
  const topics = new Map(days.map((day) => [day.dayNumber, day.topic]));
  const overrides = new Map(input.overrides.map((row) => [slotKey(row.dayNumber, row.kind, row.channel), row]));
  const ledger = new Map(input.ledger.map((row) => [slotKey(row.dayNumber, row.kind, row.channel), row]));
  const failureLists = new Map<string, TimelineFailure[]>();
  for (const failure of input.failures ?? []) {
    const key = slotKey(failure.dayNumber, failure.kind, failure.channel);
    const list = failureLists.get(key);
    const entry = { who: failure.who, reason: failure.reason };
    if (list) list.push(entry);
    else failureLists.set(key, [entry]);
  }
  const items: TimelineItem[] = [];
  const archived = input.hold === true;

  for (const day of days) {
    const openAt = dayUnlockAt({
      startDate: input.schedule.startDate,
      unlockHour: input.schedule.unlockHour,
      dayNumber: day.dayNumber,
    });
    const remindAt = reminderAt({
      startDate: input.schedule.startDate,
      dayNumber: day.dayNumber,
      reminderHour: input.schedule.reminderHour,
    });
    const slots: Array<{ kind: TimelineKind; at: Date }> = [
      { kind: "day_open", at: openAt },
      { kind: "reminder", at: remindAt },
      { kind: "rank", at: new Date(remindAt.getTime() + 60_000) },
    ];
    if (known.has(day.dayNumber - 1)) {
      slots.push({
        kind: "tomorrow",
        at: reminderAt({
          startDate: input.schedule.startDate,
          dayNumber: day.dayNumber - 1,
          reminderHour: input.schedule.reminderHour,
        }),
      });
    }
    if (known.has(day.dayNumber + 1)) {
      const nudgeAt = nudgeInstant(input.schedule, day.dayNumber);
      if (nudgeAt) slots.push({ kind: "nudge", at: nudgeAt });
    }
    if (day.dayNumber === lastDay) {
      slots.push({ kind: "final", at: remindAt });
    }
    for (const slot of slots) {
      for (const channel of ["email", "telegram"] as const) {
        const key = slotKey(day.dayNumber, slot.kind, channel);
        const override = overrides.get(key);
        const counts = ledger.get(key);
        const effective = override?.sendAt ?? slot.at;
        const audience = audienceFor(input.people, day.dayNumber, slot.kind, channel, lastDay);
        const sent = counts?.sent ?? 0;
        const pending = counts?.pending ?? 0;
        const failed = counts?.failed ?? 0;
        const skip = override?.cancelled
          ? null
          : scheduleSkipReason(input.people, day.dayNumber, slot.kind, channel, lastDay);
        const status = deriveTimelineStatus({
          cancelled: override?.cancelled === true,
          postponed: override?.sendAt != null && !override.cancelled,
          archived,
          skip,
          audience,
          sent,
          pending,
          failed,
        });
        const whenLabel = formatKyivWhen(effective, "uk-UA");
        const failures = failureLists.get(key) ?? [];
        items.push({
          key,
          source: "schedule",
          dayNumber: day.dayNumber,
          kind: slot.kind,
          channel,
          plannedAt: slot.at.toISOString(),
          effectiveAt: effective.toISOString(),
          status,
          audience,
          sentCount: sent,
          failedCount: failed,
          sentAt: counts?.sentAt ? counts.sentAt.toISOString() : null,
          reason: itemReason(status, {
            errorText: counts?.errorText ?? failures[0]?.reason ?? null,
            skip,
            archived,
          }),
          failures,
          preview: previewFor(
            slot.kind,
            day.dayNumber,
            topics.get(day.dayNumber) ?? `День ${day.dayNumber}`,
            override?.body ?? null,
            whenLabel,
            `${input.linkBase}/day/${day.dayNumber}`,
          ),
          template: override?.body?.trim()
            || COPY_DEFAULTS[KIND_COPY[slot.kind]],
          editable: timelineEditable(status),
        });
      }
    }
  }

  for (const row of input.outbox) {
    const at = row.notBefore ?? row.createdAt;
    const skip = skipCodeFromText(row.errorText);
    const failed = row.status === "failed";
    const sent = row.status === "sent";
    const pending = row.status === "pending";
    const status = deriveTimelineStatus({
      cancelled: row.status === "cancelled" && !skip,
      postponed: row.holdReason === "postpone",
      quiet: row.holdReason === "quiet",
      archived,
      skip: row.status === "cancelled" ? skip : null,
      audience: 1,
      sent: sent ? 1 : 0,
      pending: pending ? 1 : 0,
      failed: failed ? 1 : 0,
    });
    const who = row.who?.trim() || "Учасник";
    items.push({
      key: `outbox:${row.id}`,
      source: "outbox",
      dayNumber: row.dayNumber ?? 0,
      kind: row.kind ?? "day_open",
      channel: "telegram",
      plannedAt: row.createdAt.toISOString(),
      effectiveAt: at.toISOString(),
      status,
      audience: 1,
      sentCount: sent ? 1 : 0,
      failedCount: failed ? 1 : 0,
      sentAt: sent ? at.toISOString() : null,
      reason: itemReason(status, { errorText: row.errorText, skip, archived }),
      failures: failed && row.errorText ? [{ who, reason: row.errorText }] : [],
      preview: row.text,
      template: row.text,
      editable: timelineEditable(status),
      outboxId: row.id,
    });
  }

  for (const job of input.jobs) {
    const skip = skipCodeFromText(job.errorText);
    const failed = job.status === "failed";
    const sent = job.status === "sent";
    const pending = job.status === "queued" || job.status === "sending";
    const status = deriveTimelineStatus({
      cancelled: job.status === "cancelled" && !skip,
      postponed: job.holdReason === "postpone",
      quiet: job.holdReason === "quiet",
      archived,
      skip: job.status === "cancelled" ? skip : null,
      audience: 1,
      sent: sent ? 1 : 0,
      pending: pending ? 1 : 0,
      failed: failed ? 1 : 0,
    });
    const who = job.who?.trim() || "Учасник";
    items.push({
      key: `job:${job.id}`,
      source: "job",
      dayNumber: job.dayNumber,
      kind: job.kind,
      channel: isTimelineChannel(job.channel) ? job.channel : "telegram",
      plannedAt: job.sendAt.toISOString(),
      effectiveAt: job.sendAt.toISOString(),
      status,
      audience: 1,
      sentCount: sent ? 1 : 0,
      failedCount: failed ? 1 : 0,
      sentAt: sent ? job.sendAt.toISOString() : null,
      reason: itemReason(status, { errorText: job.errorText, skip, archived }),
      failures: failed && job.errorText ? [{ who, reason: job.errorText }] : [],
      preview: job.body,
      template: job.body,
      editable: timelineEditable(status),
      jobId: job.id,
    });
  }

  items.sort((a, b) => a.effectiveAt.localeCompare(b.effectiveAt) || a.key.localeCompare(b.key));
  const groups = new Map<string, TimelineItem[]>();
  for (const item of items) {
    const date = kyivDateIso(new Date(item.effectiveAt));
    const list = groups.get(date);
    if (list) list.push(item);
    else groups.set(date, [item]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, group]) => ({ date, items: group }));
}

export type GateIntent = {
  marathonId: number;
  userId: number;
  dayNumber: number;
  kind: NotifyKind | "rank";
  channel: TimelineChannel;
};

/**
 * A postponed slot leaves the natural window and returns only inside the override window.
 * A cancellation stays in the list so the processor can close it without sending.
 */
export function gateIntents<T extends GateIntent>(
  intents: T[],
  overrides: SlotOverride[],
  now: Date,
  extras: T[] = [],
): T[] {
  const kept = intents.filter((intent) => {
    const override = findSlotOverride(overrides, intent.marathonId, intent.dayNumber, intent.kind, intent.channel);
    if (!override?.sendAt || override.cancelled) return true;
    return false;
  });
  const seen = new Set(kept.map((intent) => `${intent.userId}:${slotKey(intent.dayNumber, intent.kind, intent.channel)}`));
  for (const extra of extras) {
    const override = findSlotOverride(overrides, extra.marathonId, extra.dayNumber, extra.kind, extra.channel);
    if (!override?.sendAt || override.cancelled) continue;
    if (!overrideWindowOpen(override.sendAt, now)) continue;
    const id = `${extra.userId}:${slotKey(extra.dayNumber, extra.kind, extra.channel)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    kept.push(extra);
  }
  return kept;
}
