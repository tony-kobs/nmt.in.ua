import "server-only";

import type { SqlConnection } from "@/lib/db/mysql";
import { resolveMarathonDelivery } from "@/modules/notifications/channels";
import { isDeliveryChannel } from "../channel";
import { normalizeInviteAudience } from "../invite";
import { calendarDate } from "../publicPage";
import { resolvePublicChatUrl } from "../publicChat";
import { clampLandingRiddleCount } from "../riddleQuiz";
import type { DailyMarathon, Participant } from "./types";

export type Conn = () => Promise<SqlConnection>;

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

export async function withConn<T>(
  fn: (connection: SqlConnection) => Promise<T>,
  getConnection: Conn = loadDefaultConnection,
): Promise<T> {
  const { ensureMarathonSchema } = await import("../../schema");
  await ensureMarathonSchema(getConnection);
  const connection = await getConnection();
  try {
    return await fn(connection);
  } finally {
    connection.release();
  }
}

export function flag(value: unknown): boolean {
  return value === true || value === 1 || value === "1";
}

export function isoDate(value: unknown): string {
  return calendarDate(value);
}

export function asMs(value: unknown): number | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  const ms = date.getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** Known only when every submitted day stored a duration. */
export function standingTime(doneDays: unknown, timedDays: unknown, timeSum: unknown): number | null {
  const done = Number(doneDays) || 0;
  const timed = Number(timedDays) || 0;
  if (done <= 0 || done !== timed) return null;
  const sum = Number(timeSum);
  if (!Number.isFinite(sum) || sum < 0) return null;
  return Math.floor(sum);
}

export function clampHour(value: unknown, fallback: number): number {
  const hour = Number(value);
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : fallback;
}

export function mapMarathon(row: {
  id: number;
  slug: string;
  title: string;
  description?: string | null;
  subject: string;
  start_date: unknown;
  unlock_hour: string;
  reminder_hour?: string | null;
  nudge_from?: number | null;
  nudge_until?: number | null;
  days_count: number;
  pass_threshold: number;
  final_cta_text: string | null;
  final_cta_url: string | null;
  intro_video_url?: string | null;
  invite_audience?: string | null;
  landing_riddle_count?: number | null;
  public_chat_url?: string | null;
  status: string;
}, options?: { requireStart?: boolean }): DailyMarathon | null {
  if (
    row.status !== "draft" &&
    row.status !== "active" &&
    row.status !== "finished" &&
    row.status !== "archived"
  ) {
    return null;
  }
  const startDate = isoDate(row.start_date);
  if (options?.requireStart !== false && !startDate) return null;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: String(row.description ?? "").trim(),
    subject: row.subject,
    startDate,
    unlockHour: String(row.unlock_hour).slice(0, 5),
    reminderHour: String(row.reminder_hour ?? "19:00").slice(0, 5),
    nudgeFrom: clampHour(row.nudge_from, 10),
    nudgeUntil: clampHour(row.nudge_until, 21),
    daysCount: Number(row.days_count),
    passThreshold: Number(row.pass_threshold),
    finalCtaText: row.final_cta_text ?? "",
    finalCtaUrl: row.final_cta_url ?? "",
    introVideoUrl: row.intro_video_url ?? "",
    inviteAudience: normalizeInviteAudience(row.invite_audience),
    landingRiddleCount: clampLandingRiddleCount(row.landing_riddle_count),
    publicChatUrl: resolvePublicChatUrl(row.slug, row.public_chat_url),
    status: row.status,
  };
}

export const MARATHON_SELECT = `id, slug, title, description, subject, start_date, unlock_hour, reminder_hour,
  nudge_from, nudge_until, days_count, pass_threshold, final_cta_text, final_cta_url,
  intro_video_url, invite_audience, landing_riddle_count, public_chat_url, status`;

export function mapParticipant(row: {
  user_id: number;
  source: string | null;
  streak: number;
  finished_at: unknown;
  converted_at: unknown;
  telegram_chat_id: number | string | null;
  notify_email: number;
  notify_bot: number;
  delivery_channel: string | null;
  intro_seen_at: unknown;
  notify_paused: number;
  pref_email?: number | null;
  pref_telegram?: number | null;
  email: string | null;
  display_name: string | null;
}): Participant {
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
  return {
    userId: row.user_id,
    source: row.source,
    streak: Number(row.streak) || 0,
    finishedAt: row.finished_at ? String(row.finished_at) : null,
    convertedAt: row.converted_at ? String(row.converted_at) : null,
    telegramChatId: row.telegram_chat_id == null ? null : String(row.telegram_chat_id),
    notifyEmail: delivery.notifyEmail,
    notifyBot: delivery.notifyBot,
    channel,
    introSeen: Boolean(row.intro_seen_at),
    notifyPaused: paused,
    email: row.email,
    displayName: row.display_name?.trim() || "",
  };
}
