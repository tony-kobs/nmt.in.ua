import { DAY_OPEN_NOTIFY_WINDOW_MS, dayUnlockAt, formatKyivWhen, kyivDateIso, kyivHour, reminderAt, zonedWallTimeToUtc, addCalendarDays } from "./calendar";
import { personNotifyChannels, type NotifyPersonFlags } from "./channel";
import { COPY_DEFAULTS, renderCopy, type CopyKey, type CopyVars } from "./copy";
import type { NotifyKind } from "./notifications";

export const TIMELINE_KINDS = ["day_open", "reminder", "nudge", "tomorrow", "final", "rank"] as const;
export type TimelineKind = (typeof TIMELINE_KINDS)[number];
export type TimelineChannel = "email" | "telegram";
export type TimelineStatus = "planned" | "queued" | "sent" | "failed" | "cancelled";

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
};

export type OutboxSnapshot = {
  id: number;
  status: "pending" | "sent" | "failed" | "cancelled";
  notBefore: Date | null;
  createdAt: Date;
  text: string;
  dayNumber: number | null;
  kind: string | null;
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

function statusFor(input: {
  cancelled: boolean;
  audience: number;
  sent: number;
  pending: number;
  failed: boolean;
}): TimelineStatus {
  if (input.cancelled) return "cancelled";
  if (input.pending > 0) return "queued";
  if (input.failed && input.sent === 0) return "failed";
  if (input.sent > 0 && input.audience === 0) return "sent";
  if (input.audience > 0 && input.sent >= input.audience) return "sent";
  return "planned";
}

export function buildMessageTimeline(input: {
  schedule: ScheduleInput;
  linkBase: string;
  people: TimelinePerson[];
  ledger: LedgerCount[];
  overrides: SlotOverride[];
  outbox: OutboxSnapshot[];
  jobs: JobSnapshot[];
  now?: Date;
  /** Archived course: keep sent history, show every other row as cancelled. */
  hold?: boolean;
}): TimelineDay[] {
  const days = [...input.schedule.days].sort((a, b) => a.dayNumber - b.dayNumber);
  const known = new Set(days.map((day) => day.dayNumber));
  const lastDay = days[days.length - 1]?.dayNumber ?? 0;
  const topics = new Map(days.map((day) => [day.dayNumber, day.topic]));
  const overrides = new Map(input.overrides.map((row) => [slotKey(row.dayNumber, row.kind, row.channel), row]));
  const ledger = new Map(input.ledger.map((row) => [slotKey(row.dayNumber, row.kind, row.channel), row]));
  const items: TimelineItem[] = [];

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
        const status = statusFor({
          cancelled: override?.cancelled === true,
          audience,
          sent,
          pending,
          failed: false,
        });
        const whenLabel = formatKyivWhen(effective, "uk-UA");
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
          editable: status !== "sent" && status !== "cancelled",
        });
      }
    }
  }

  for (const row of input.outbox) {
    const at = row.notBefore ?? row.createdAt;
    const status: TimelineStatus = row.status === "pending"
      ? "queued"
      : row.status === "cancelled"
        ? "cancelled"
        : row.status;
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
      sentCount: row.status === "sent" ? 1 : 0,
      preview: row.text,
      template: row.text,
      editable: status === "queued" || status === "failed",
      outboxId: row.id,
    });
  }

  for (const job of input.jobs) {
    const status: TimelineStatus = job.status === "sending" ? "queued" : job.status;
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
      sentCount: job.status === "sent" ? 1 : 0,
      preview: job.body,
      template: job.body,
      editable: status === "queued" || status === "failed",
      jobId: job.id,
    });
  }

  if (input.hold) {
    for (const item of items) {
      if (item.status === "sent") continue;
      item.status = "cancelled";
      item.editable = false;
    }
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
