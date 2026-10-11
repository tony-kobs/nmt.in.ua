import "server-only";
import type { SqlConnection } from "@/lib/db/mysql";
import { mysqlErrno } from "@/modules/teacher-students/mysqlErrno";
import type { TelegramAccountRole } from "./account";

/** Every setting here is read by `processTelegramTaskNotifications`; nothing is stored that is not enforced. */
export type NotificationPreferences = {
  newTasks: boolean;
  deadlineReminders: boolean;
  dailyReminder: boolean;
  teacherResults: boolean;
  teacherDaily: boolean;
  quietStart: number | null;
  quietEnd: number | null;
  /** Unix time of the last teacher baseline; null means past completions are not yet marked as seen. */
  teacherBaselineAt: number | null;
  studentDigestOn: string | null;
  teacherDigestOn: string | null;
};

/** No row means these values: new-task notifications keep their pre-TG-015 behaviour. */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  newTasks: true,
  deadlineReminders: true,
  dailyReminder: true,
  teacherResults: true,
  teacherDaily: false,
  quietStart: null,
  quietEnd: null,
  teacherBaselineAt: null,
  studentDigestOn: null,
  teacherDigestOn: null,
};

export const PREFERENCE_TOGGLES = {
  new: { column: "new_tasks", field: "newTasks", role: "student", label: "Нові завдання" },
  dl: { column: "deadline_reminders", field: "deadlineReminders", role: "student", label: "Нагадування про терміни" },
  day: { column: "daily_reminder", field: "dailyReminder", role: "student", label: "Щоденне нагадування о 17:00" },
  tr: { column: "teacher_results", field: "teacherResults", role: "teacher", label: "Результати учнів" },
  td: { column: "teacher_daily", field: "teacherDaily", role: "teacher", label: "Щоденний підсумок о 20:00" },
} as const satisfies Record<string, {
  column: string; field: keyof NotificationPreferences; role: TelegramAccountRole; label: string;
}>;
export type PreferenceToggle = keyof typeof PREFERENCE_TOGGLES;

/** Fixed presets keep input validation trivial: the callback carries only an index. */
export const QUIET_HOUR_PRESETS: readonly (readonly [number, number] | null)[] = [null, [22, 8], [23, 7], [21, 9]];

export function isPreferenceToggle(value: string): value is PreferenceToggle {
  return Object.prototype.hasOwnProperty.call(PREFERENCE_TOGGLES, value);
}

export function togglesForRole(role: TelegramAccountRole): PreferenceToggle[] {
  return (Object.keys(PREFERENCE_TOGGLES) as PreferenceToggle[])
    .filter((key) => PREFERENCE_TOGGLES[key].role === role);
}

export function quietPresetIndex(prefs: Pick<NotificationPreferences, "quietStart" | "quietEnd">): number {
  const index = QUIET_HOUR_PRESETS.findIndex((preset) => preset
    ? preset[0] === prefs.quietStart && preset[1] === prefs.quietEnd
    : prefs.quietStart === null);
  return index < 0 ? 0 : index;
}

export function formatQuietHours(prefs: Pick<NotificationPreferences, "quietStart" | "quietEnd">): string {
  if (prefs.quietStart === null || prefs.quietEnd === null) return "вимкнено";
  const pad = (hour: number) => `${String(hour).padStart(2, "0")}:00`;
  return `${pad(prefs.quietStart)}–${pad(prefs.quietEnd)}`;
}

/** Kyiv hour inside [start, end); windows may wrap past midnight. */
export function isQuietHour(prefs: Pick<NotificationPreferences, "quietStart" | "quietEnd">, kyivHour: number): boolean {
  const { quietStart: start, quietEnd: end } = prefs;
  if (start === null || end === null || start === end) return false;
  return start < end ? kyivHour >= start && kyivHour < end : kyivHour >= start || kyivHour < end;
}

export function isMissingTableError(error: unknown): boolean {
  return mysqlErrno(error) === 1146
    || (typeof error === "object" && error !== null && (error as { code?: unknown }).code === "ER_NO_SUCH_TABLE");
}

type Row = {
  account_id: number;
  new_tasks: number; deadline_reminders: number; daily_reminder: number;
  teacher_results: number; teacher_daily: number;
  quiet_start: number | null; quiet_end: number | null;
  baseline_unix: number | string | null;
  student_digest_on: string | Date | null; teacher_digest_on: string | Date | null;
};

const SQL_SELECT = `SELECT account_id, new_tasks, deadline_reminders, daily_reminder, teacher_results, teacher_daily,
  quiet_start, quiet_end, UNIX_TIMESTAMP(teacher_baseline_at) AS baseline_unix,
  DATE_FORMAT(student_digest_on, '%Y-%m-%d') AS student_digest_on, DATE_FORMAT(teacher_digest_on, '%Y-%m-%d') AS teacher_digest_on
  FROM telegram_notification_preferences`;

function hour(value: unknown): number | null {
  const number = Number(value);
  return value != null && Number.isInteger(number) && number >= 0 && number <= 23 ? number : null;
}

function day(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function fromRow(row: Row): NotificationPreferences {
  const baseline = row.baseline_unix == null ? NaN : Number(row.baseline_unix);
  return {
    newTasks: Boolean(Number(row.new_tasks)),
    deadlineReminders: Boolean(Number(row.deadline_reminders)),
    dailyReminder: Boolean(Number(row.daily_reminder)),
    teacherResults: Boolean(Number(row.teacher_results)),
    teacherDaily: Boolean(Number(row.teacher_daily)),
    quietStart: hour(row.quiet_start),
    quietEnd: hour(row.quiet_end),
    teacherBaselineAt: Number.isFinite(baseline) ? baseline : null,
    studentDigestOn: day(row.student_digest_on),
    teacherDigestOn: day(row.teacher_digest_on),
  };
}

/** Preferences for the given accounts, or null when migration 042 is not applied yet (callers fall back to TG-007 behaviour). */
export async function loadNotificationPreferences(
  connection: SqlConnection,
  accountIds: number[],
): Promise<Map<number, NotificationPreferences> | null> {
  const ids = accountIds.filter((id) => Number.isSafeInteger(id) && id > 0);
  const result = new Map<number, NotificationPreferences>();
  try {
    if (!ids.length) {
      await connection.query(`${SQL_SELECT} WHERE 1 = 0`);
      return result;
    }
    const rows = await connection.query<Row>(`${SQL_SELECT} WHERE account_id IN (${ids.map(() => "?").join(", ")})`, ids);
    for (const row of rows) result.set(Number(row.account_id), fromRow(row));
    return result;
  } catch (error) {
    if (isMissingTableError(error)) return null;
    throw error;
  }
}

export async function getNotificationPreferences(connection: SqlConnection, accountId: number): Promise<NotificationPreferences | null> {
  const map = await loadNotificationPreferences(connection, [accountId]);
  return map ? map.get(accountId) ?? { ...DEFAULT_NOTIFICATION_PREFERENCES } : null;
}

/** Atomic flip; the first write starts from the default. Re-enabling teacher results re-baselines past completions. */
export async function toggleNotificationPreference(connection: SqlConnection, accountId: number, key: PreferenceToggle): Promise<void> {
  const { column, field } = PREFERENCE_TOGGLES[key];
  const initial = DEFAULT_NOTIFICATION_PREFERENCES[field] ? 0 : 1;
  const rebaseline = key === "tr" ? ", teacher_baseline_at = IF(teacher_results = 1, NULL, teacher_baseline_at)" : "";
  await connection.execute(`INSERT INTO telegram_notification_preferences (account_id, ${column}) VALUES (?, ?)
    ON DUPLICATE KEY UPDATE ${column} = 1 - ${column}${rebaseline}`, [accountId, initial]);
}

export async function setQuietHours(connection: SqlConnection, accountId: number, presetIndex: number): Promise<void> {
  if (!Number.isInteger(presetIndex) || presetIndex < 0 || presetIndex >= QUIET_HOUR_PRESETS.length) {
    throw new Error("Unknown quiet hours preset.");
  }
  const preset = QUIET_HOUR_PRESETS[presetIndex];
  await connection.execute(`INSERT INTO telegram_notification_preferences (account_id, quiet_start, quiet_end) VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE quiet_start = VALUES(quiet_start), quiet_end = VALUES(quiet_end)`,
  [accountId, preset?.[0] ?? null, preset?.[1] ?? null]);
}

export async function ensureNotificationPreferences(connection: SqlConnection, accountId: number): Promise<void> {
  await connection.execute(`INSERT INTO telegram_notification_preferences (account_id) VALUES (?)
    ON DUPLICATE KEY UPDATE account_id = account_id`, [accountId]);
}

/**
 * Claims today's digest slot. Exactly one concurrent processor gets `true`; an uncertain send keeps the
 * slot (no automatic retry), a confirmed rejection gives it back via `releaseDigest`.
 */
export async function claimDigest(connection: SqlConnection, accountId: number, kind: "student" | "teacher", today: string): Promise<boolean> {
  const column = kind === "student" ? "student_digest_on" : "teacher_digest_on";
  await ensureNotificationPreferences(connection, accountId);
  const result = await connection.execute(`UPDATE telegram_notification_preferences SET ${column} = ?
    WHERE account_id = ? AND (${column} IS NULL OR ${column} <> ?)`, [today, accountId, today]);
  return result.affectedRows === 1;
}

export async function releaseDigest(connection: SqlConnection, accountId: number, kind: "student" | "teacher", today: string, previous: string | null): Promise<void> {
  const column = kind === "student" ? "student_digest_on" : "teacher_digest_on";
  await connection.execute(`UPDATE telegram_notification_preferences SET ${column} = ? WHERE account_id = ? AND ${column} = ?`,
    [previous, accountId, today]);
}
