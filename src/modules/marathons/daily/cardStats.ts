import "server-only";

import type { SqlConnection } from "@/lib/db/mysql";
import { mysqlErrno } from "@/modules/teacher-students/mysqlErrno";
import { currentDayNumber, dayUnlockAt, kyivDateIso } from "./calendar";
import { nextTimelineSend, type SlotOverride } from "./messageTimeline";
import { loadOverridesSafe } from "./messageOverrides";
import type { DailyMarathon } from "./store";

export type CardCourse = Pick<
  DailyMarathon,
  | "id"
  | "status"
  | "startDate"
  | "unlockHour"
  | "reminderHour"
  | "nudgeFrom"
  | "nudgeUntil"
  | "daysCount"
>;

export type CardStatRow = {
  marathonId: number;
  dayNumber: number | null;
  registered: number;
  telegram: number;
  finished: number;
  submitted: number;
  scoreSum: number;
  scoreCount: number;
  taskCount: number;
  nextOutbox: Date | null;
  nextJob: Date | null;
};

export type CardFocus = "today" | "last" | "day";

export type CardStats = {
  registered: number;
  telegram: number;
  focus: CardFocus;
  focusDay: number | null;
  focusSubmitted: number;
  finished: number;
  /** Mean of submitted day percents, the same scores the leaderboard averages. */
  avgScore: number | null;
  /** Submitted days / (participants × course length). */
  completionPercent: number | null;
  progress: { kind: "day"; current: number; total: number } | { kind: "start"; date: string };
  nextSendAt: Date | null;
};

type Bucket = {
  registered: number;
  telegram: number;
  finished: number;
  scoreSum: number;
  scoreCount: number;
  submittedByDay: Map<number, number>;
  contentDays: number[];
  nextOutbox: Date | null;
  nextJob: Date | null;
};

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function asDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

function earlier(left: Date | null, right: Date | null): Date | null {
  if (!left) return right;
  if (!right) return left;
  return left.getTime() <= right.getTime() ? left : right;
}

function focusOf(course: CardCourse, now: Date, day: number | null): CardFocus {
  if (day == null) return "day";
  try {
    const unlock = dayUnlockAt({
      startDate: course.startDate,
      unlockHour: course.unlockHour,
      dayNumber: day,
    });
    if (kyivDateIso(unlock) === kyivDateIso(now)) return "today";
    if (course.status === "finished" || course.status === "archived" || now.getTime() >= unlock.getTime()) {
      return "last";
    }
  } catch {
    return "day";
  }
  return "day";
}

/**
 * Folds one grouped result (a row per course day, totals repeated) into a card.
 * Registered, Telegram and finished are not multiplied by the number of days.
 */
export function foldCardStats(input: {
  courses: readonly CardCourse[];
  rows: readonly CardStatRow[];
  overrides?: readonly SlotOverride[];
  now: Date;
}): Map<number, CardStats> {
  const buckets = new Map<number, Bucket>();
  for (const row of input.rows) {
    const created: Bucket = {
      registered: num(row.registered),
      telegram: num(row.telegram),
      finished: num(row.finished),
      scoreSum: 0,
      scoreCount: 0,
      submittedByDay: new Map(),
      contentDays: [],
      nextOutbox: null,
      nextJob: null,
    };
    const bucket = buckets.get(row.marathonId) ?? created;
    bucket.registered = Math.max(bucket.registered, num(row.registered));
    bucket.telegram = Math.max(bucket.telegram, num(row.telegram));
    bucket.finished = Math.max(bucket.finished, num(row.finished));
    bucket.scoreSum += num(row.scoreSum);
    bucket.scoreCount += num(row.scoreCount);
    bucket.nextOutbox = earlier(bucket.nextOutbox, row.nextOutbox);
    bucket.nextJob = earlier(bucket.nextJob, row.nextJob);
    if (row.dayNumber != null && row.dayNumber > 0) {
      bucket.submittedByDay.set(row.dayNumber, num(row.submitted));
      if (num(row.taskCount) > 0 && !bucket.contentDays.includes(row.dayNumber)) {
        bucket.contentDays.push(row.dayNumber);
      }
    }
    buckets.set(row.marathonId, bucket);
  }

  const stats = new Map<number, CardStats>();
  for (const course of input.courses) {
    const bucket = buckets.get(course.id);
    const registered = bucket?.registered ?? 0;
    const day = currentDayNumber({
      now: input.now,
      startDate: course.startDate,
      unlockHour: course.unlockHour,
      daysCount: course.daysCount,
    });
    const submittedSum = bucket
      ? [...bucket.submittedByDay.values()].reduce((sum, count) => sum + count, 0)
      : 0;
    const possible = registered > 0 && course.daysCount > 0 ? registered * course.daysCount : 0;
    const completion = possible > 0 ? Math.round((100 * submittedSum) / possible) : null;
    const avg = bucket && bucket.scoreCount > 0
      ? Math.round(bucket.scoreSum / bucket.scoreCount)
      : null;
    const contentDays = (bucket?.contentDays ?? []).sort((a, b) => a - b);
    stats.set(course.id, {
      registered,
      telegram: bucket?.telegram ?? 0,
      focus: focusOf(course, input.now, day),
      focusDay: day,
      focusSubmitted: day != null ? bucket?.submittedByDay.get(day) ?? 0 : 0,
      finished: bucket?.finished ?? 0,
      avgScore: avg,
      completionPercent: completion == null ? null : Math.min(100, completion),
      progress: course.status === "draft" || day == null
        ? { kind: "start", date: course.startDate }
        : { kind: "day", current: day, total: course.daysCount },
      nextSendAt: nextTimelineSend({
        schedule: {
          startDate: course.startDate,
          unlockHour: course.unlockHour,
          reminderHour: course.reminderHour,
          nudgeFrom: course.nudgeFrom,
          nudgeUntil: course.nudgeUntil,
          days: contentDays.map((dayNumber) => ({ dayNumber, topic: "" })),
        },
        marathonId: course.id,
        overrides: [...(input.overrides ?? [])],
        now: input.now,
        hold: course.status === "archived",
        extra: [bucket?.nextOutbox ?? null, bucket?.nextJob ?? null],
      }),
    });
  }
  return stats;
}

function statsSql(ids: number[], withTelegramAccount: boolean): string {
  const marks = ids.map(() => "?").join(", ");
  const telegramJoin = withTelegramAccount
    ? "LEFT JOIN user_telegram_accounts a ON a.user_id = p.user_id"
    : "";
  const telegramSum = withTelegramAccount
    ? "SUM(IF((p.telegram_chat_id IS NOT NULL AND p.telegram_chat_id > 0) OR a.user_id IS NOT NULL, 1, 0))"
    : "SUM(IF(p.telegram_chat_id IS NOT NULL AND p.telegram_chat_id > 0, 1, 0))";
  return `
  SELECT m.id AS marathon_id,
         d.day_number,
         COALESCE(part.registered, 0) AS registered,
         COALESCE(part.telegram_count, 0) AS telegram_count,
         COALESCE(part.finished, 0) AS finished,
         COALESCE(daystat.submitted, 0) AS submitted,
         COALESCE(daystat.score_sum, 0) AS score_sum,
         COALESCE(daystat.score_count, 0) AS score_count,
         COALESCE(tasks.task_count, 0) AS task_count,
         box.next_outbox,
         job.next_job
  FROM marathons m
  LEFT JOIN marathon_days d ON d.marathon_id = m.id
  LEFT JOIN (
    SELECT p.marathon_id,
           COUNT(*) AS registered,
           ${telegramSum} AS telegram_count,
           SUM(p.finished_at IS NOT NULL) AS finished
    FROM marathon_participants p
    ${telegramJoin}
    GROUP BY p.marathon_id
  ) part ON part.marathon_id = m.id
  LEFT JOIN (
    SELECT pr.marathon_id, dayrow.day_number,
           COUNT(DISTINCT IF(pr.completed_at IS NOT NULL, pr.user_id, NULL)) AS submitted,
           SUM(IF(pr.completed_at IS NOT NULL AND pr.score IS NOT NULL, pr.score, 0)) AS score_sum,
           SUM(IF(pr.completed_at IS NOT NULL AND pr.score IS NOT NULL, 1, 0)) AS score_count
    FROM marathon_day_progress pr
    INNER JOIN marathon_days dayrow ON dayrow.id = pr.day_id
    GROUP BY pr.marathon_id, dayrow.day_number
  ) daystat ON daystat.marathon_id = m.id AND daystat.day_number = d.day_number
  LEFT JOIN (
    SELECT dayrow.marathon_id, dayrow.day_number, COUNT(t.id) AS task_count
    FROM marathon_days dayrow
    LEFT JOIN marathon_day_tasks t ON t.day_id = dayrow.id
    GROUP BY dayrow.marathon_id, dayrow.day_number
  ) tasks ON tasks.marathon_id = m.id AND tasks.day_number = d.day_number
  LEFT JOIN (
    SELECT marathon_id, MIN(COALESCE(not_before, created_at)) AS next_outbox
    FROM marathon_telegram_outbox
    WHERE status = 'pending' AND marathon_id IS NOT NULL
    GROUP BY marathon_id
  ) box ON box.marathon_id = m.id
  LEFT JOIN (
    SELECT marathon_id, MIN(send_at) AS next_job
    FROM marathon_message_jobs
    WHERE status IN ('queued', 'sending')
    GROUP BY marathon_id
  ) job ON job.marathon_id = m.id
  WHERE m.id IN (${marks})`;
}

export function cardStatsSql(ids: number[]): string {
  return statsSql(ids, true);
}

type RawStat = {
  marathon_id: number;
  day_number: number | null;
  registered: number | string;
  telegram_count: number | string;
  finished: number | string;
  submitted: number | string;
  score_sum: number | string | null;
  score_count: number | string;
  task_count: number | string;
  next_outbox: Date | string | null;
  next_job: Date | string | null;
};

function mapRaw(row: RawStat): CardStatRow {
  return {
    marathonId: num(row.marathon_id),
    dayNumber: row.day_number == null ? null : num(row.day_number),
    registered: num(row.registered),
    telegram: num(row.telegram_count),
    finished: num(row.finished),
    submitted: num(row.submitted),
    scoreSum: num(row.score_sum),
    scoreCount: num(row.score_count),
    taskCount: num(row.task_count),
    nextOutbox: asDate(row.next_outbox),
    nextJob: asDate(row.next_job),
  };
}

async function queryOnce(
  query: (sql: string, params: unknown[]) => Promise<RawStat[]>,
  ids: number[],
): Promise<CardStatRow[]> {
  try {
    return (await query(statsSql(ids, true), ids)).map(mapRaw);
  } catch (error) {
    if (mysqlErrno(error) !== 1146 && mysqlErrno(error) !== 1054) throw error;
    return (await query(statsSql(ids, false), ids)).map(mapRaw);
  }
}

/** One grouped read for every card. Overrides are the existing bulk list, not a query per course. */
export async function loadMarathonCardStats(
  courses: readonly CardCourse[],
  deps: {
    now?: Date;
    query?: (sql: string, params: unknown[]) => Promise<RawStat[]>;
    overrides?: SlotOverride[];
    getConnection?: () => Promise<SqlConnection>;
  } = {},
): Promise<Map<number, CardStats>> {
  const now = deps.now ?? new Date();
  if (courses.length === 0) return new Map();
  const ids = courses.map((course) => course.id);
  let rows: CardStatRow[] = [];
  try {
    if (deps.query) {
      rows = await queryOnce(deps.query, ids);
    } else {
      const { getConnection } = await import("@/lib/db/mysql");
      const connection = await (deps.getConnection ?? getConnection)();
      try {
        rows = await queryOnce(
          (sql, params) => connection.query<RawStat>(sql, params),
          ids,
        );
      } finally {
        connection.release();
      }
    }
  } catch (error) {
    console.error("marathon card stats", error);
    rows = [];
  }
  const overrides = deps.overrides ?? await loadOverridesSafe();
  return foldCardStats({ courses, rows, overrides, now });
}
