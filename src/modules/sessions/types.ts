import { durationLocale, formatMarathonDuration } from "@/modules/marathons/daily/durationText";
import { nowUnixSec } from "@/modules/testing/sessionElapsed";
import { isSessionExpired } from "@/modules/testing/sessionExpiry";

export const SESSION_STATUS_COMPLETED = 1;
export const SESSION_STATUS_CREATED = 2;
export const SESSION_STATUS_PLANNED = 3;

/** Verified `task_sessions.session_type` → «ким створено». */
export const SESSION_TYPE_USER = 1;
export const SESSION_TYPE_AUTO = 2;
export const SESSION_TYPE_MENTOR = 3;
/** Official NMT simulator. `theme_id` is null; the label comes from `nmt_variants`. */
export const SESSION_TYPE_NMT = 4;

export type SessionDisplayStatus = "completed" | "planned" | "expired";

export type SessionCreatedBy = "auto" | "mentor" | "user";

export type LearningSessionRow = {
  id: number;
  rowNumber: number;
  themeId: number;
  difficulty: number | null;
  themeName: string;
  tasksNumber: number;
  rightNumber: number;
  percent: number | null;
  timeSec: number;
  timePerTaskSec: number | null;
  startTimeLabel: string;
  /** When a mentor assignment opens; null if immediate / unknown. */
  availableAt: number | null;
  availableAtLabel: string | null;
  /** End of mentor assignment window (due / expire). */
  dueAt: number | null;
  dueAtLabel: string | null;
  /** False while waiting for availableAt on a planned mentor assignment. */
  canStart: boolean;
  createdByLabel: string;
  createdBy: SessionCreatedBy;
  status: SessionDisplayStatus;
  statusLabel: string;
  /** NMT test points when the attempt stored them. */
  testPoints?: number | null;
  maxTestPoints?: number | null;
};

export type TaskSessionRecord = {
  id: number;
  theme_id: number;
  difficulty: number | null;
  theme_name: string;
  tasks_number: number;
  right_number: number;
  time: number;
  session_status: number;
  session_type: number;
  start_time: number;
  expire_time: number;
  test_points?: number | null;
  test_points_max?: number | null;
  available_at?: number | null;
  due_at?: number | null;
};

/** `18/32` when an NMT attempt stored test points. */
export function formatTestPointPrefix(
  points: number | null | undefined,
  max: number | null | undefined,
): string | null {
  if (points == null || max == null || max <= 0) return null;
  return `${points}/${max}`;
}

export function sessionPercent(
  tasksNumber: number,
  rightNumber: number
): number | null {
  if (tasksNumber <= 0) return null;
  return (rightNumber / tasksNumber) * 100;
}

export function sessionTimePerTask(
  tasksNumber: number,
  timeSec: number
): number | null {
  if (tasksNumber <= 0 || timeSec <= 0) return null;
  return timeSec / tasksNumber;
}

/**
 * The UI distinguishes finished, actionable-but-not-finished ("planned"),
 * and no-longer-actionable ("expired"): a completed session (or one whose
 * answers/time already satisfy completion) always reads as "completed" —
 * results are preserved regardless of `expire_time`. Anything else past its
 * 24h deadline reads as "expired" instead of "planned" — never renewed by
 * merely rendering the list.
 */
export function resolveSessionDisplayStatus(
  session: Pick<
    TaskSessionRecord,
    "session_status" | "tasks_number" | "right_number" | "time" | "expire_time"
  >,
  nowSec: number = nowUnixSec()
): SessionDisplayStatus {
  if (
    session.session_status === SESSION_STATUS_COMPLETED ||
    (session.tasks_number > 0 &&
      session.right_number >= session.tasks_number &&
      session.time > 0)
  ) {
    return "completed";
  }
  if (isSessionExpired(session.expire_time, nowSec)) {
    return "expired";
  }
  return "planned";
}

export function sessionStatusLabel(status: SessionDisplayStatus): string {
  switch (status) {
    case "completed":
      return "Виконано";
    case "planned":
      return "Заплановано";
    case "expired":
      return "Термін дії сплинув";
  }
}

export function resolveSessionCreatedBy(sessionType: number): SessionCreatedBy {
  switch (sessionType) {
    case SESSION_TYPE_AUTO:
      return "auto";
    case SESSION_TYPE_MENTOR:
      return "mentor";
    default:
      return "user";
  }
}

export function sessionCreatedByLabel(sessionType: number): string {
  switch (sessionType) {
    case SESSION_TYPE_AUTO:
      return "Авто";
    case SESSION_TYPE_MENTOR:
      return "Ментор";
    default:
      return "Користувач";
  }
}

export function formatSessionStartTime(startTime: number): string {
  if (!Number.isFinite(startTime) || startTime <= 0) {
    return "—";
  }
  const ms = startTime > 1_000_000_000_000 ? startTime : startTime * 1000;
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ms));
}

export function formatDurationSeconds(seconds: number, locale = "uk"): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  return formatMarathonDuration(seconds, durationLocale(locale));
}

export function formatTimePerTask(seconds: number | null, locale = "uk"): string {
  if (seconds === null) return "—";
  return formatDurationSeconds(seconds, locale);
}

function asCount(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === "bigint" ? Number(value) : Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.trunc(n);
}

function asUnixSec(value: unknown): number | null {
  const n = asCount(value);
  if (n == null || n <= 0) return null;
  return n;
}

export function buildLearningSessionRows(
  sessions: TaskSessionRecord[],
  nowSec: number = nowUnixSec()
): LearningSessionRow[] {
  return sessions.map((session, index) => {
    const status = resolveSessionDisplayStatus(session, nowSec);
    const availableAt = asUnixSec(session.available_at);
    const dueAtRaw =
      asUnixSec(session.due_at) ??
      (session.session_type === SESSION_TYPE_MENTOR
        ? asUnixSec(session.expire_time)
        : null);
    const waiting =
      status === "planned" && availableAt != null && nowSec < availableAt;
    const testPoints = asCount(session.test_points);
    const maxTestPoints = asCount(session.test_points_max);
    const hasTestPoints =
      testPoints != null && maxTestPoints != null && maxTestPoints > 0;
    return {
      id: session.id,
      rowNumber: index + 1,
      themeId: session.theme_id,
      difficulty: session.difficulty,
      themeName: session.theme_name.trim(),
      tasksNumber: session.tasks_number,
      rightNumber: session.right_number,
      percent: hasTestPoints
        ? sessionPercent(maxTestPoints, testPoints)
        : sessionPercent(session.tasks_number, session.right_number),
      testPoints: hasTestPoints ? testPoints : null,
      maxTestPoints: hasTestPoints ? maxTestPoints : null,
      timeSec: session.time,
      timePerTaskSec: sessionTimePerTask(session.tasks_number, session.time),
      startTimeLabel: formatSessionStartTime(session.start_time),
      availableAt,
      availableAtLabel: availableAt
        ? formatSessionStartTime(availableAt)
        : null,
      dueAt: dueAtRaw,
      dueAtLabel: dueAtRaw ? formatSessionStartTime(dueAtRaw) : null,
      canStart: status === "planned" && !waiting,
      createdBy: resolveSessionCreatedBy(session.session_type),
      createdByLabel: sessionCreatedByLabel(session.session_type),
      status,
      statusLabel: sessionStatusLabel(status),
    };
  });
}
