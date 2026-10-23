import "server-only";

import type { SqlConnection } from "@/lib/db/mysql";
import { mysqlErrno } from "@/modules/teacher-students/mysqlErrno";
import { buildDailyFunnel, type DailyFunnel, type DayFunnelInput } from "./dailyStats";

type CourseRef = { id: number; slug: string; daysCount: number };

async function withConn<T>(fn: (connection: SqlConnection) => Promise<T>): Promise<T> {
  const { ensureMarathonSchema } = await import("../schema");
  const { getConnection } = await import("@/lib/db/mysql");
  await ensureMarathonSchema();
  const connection = await getConnection();
  try {
    return await fn(connection);
  } finally {
    connection.release();
  }
}

function missingRelation(error: unknown): boolean {
  const errno = mysqlErrno(error);
  return errno === 1146 || errno === 1054;
}

async function grouped(
  connection: SqlConnection,
  sql: string,
  params: unknown[],
): Promise<Map<number, number>> {
  try {
    const rows = await connection.query<{ marathon_id: number; n: number }>(sql, params);
    const counts = new Map<number, number>();
    for (const row of rows) counts.set(Number(row.marathon_id), Number(row.n) || 0);
    return counts;
  } catch (error) {
    if (missingRelation(error)) return new Map();
    throw error;
  }
}

async function funnelsFor(connection: SqlConnection, courses: readonly CourseRef[]): Promise<Map<number, DailyFunnel>> {
  const ids = courses.map((course) => course.id);
  const marks = ids.map(() => "?").join(", ");
  const people = await connection.query<{
    marathon_id: number;
    registered: number;
    telegram_linked: number;
    finished: number;
  }>(
    `SELECT marathon_id,
            COUNT(*) AS registered,
            SUM(IF(telegram_chat_id IS NOT NULL AND telegram_chat_id > 0, 1, 0)) AS telegram_linked,
            SUM(finished_at IS NOT NULL) AS finished
     FROM marathon_participants
     WHERE marathon_id IN (${marks})
     GROUP BY marathon_id`,
    ids,
  );
  const dayRows = await connection.query<{
    marathon_id: number;
    day_number: number;
    opened: number;
    completed: number;
    score_sum: number;
    score_count: number;
  }>(
    `SELECT d.marathon_id, d.day_number,
            COUNT(DISTINCT pr.user_id) AS opened,
            COUNT(DISTINCT IF(pr.completed_at IS NOT NULL, pr.user_id, NULL)) AS completed,
            SUM(IF(pr.completed_at IS NOT NULL AND pr.score IS NOT NULL, pr.score, 0)) AS score_sum,
            SUM(IF(pr.completed_at IS NOT NULL AND pr.score IS NOT NULL, 1, 0)) AS score_count
     FROM marathon_days d
     LEFT JOIN marathon_day_progress pr ON pr.day_id = d.id AND pr.marathon_id = d.marathon_id
     WHERE d.marathon_id IN (${marks})
     GROUP BY d.marathon_id, d.day_number`,
    ids,
  );
  const since = "UTC_TIMESTAMP() - INTERVAL 24 HOUR";
  const outbox = await grouped(
    connection,
    `SELECT marathon_id, COUNT(*) AS n FROM marathon_telegram_outbox
     WHERE status = 'failed' AND marathon_id IN (${marks}) AND created_at >= ${since}
     GROUP BY marathon_id`,
    ids,
  );
  const jobs = await grouped(
    connection,
    `SELECT marathon_id, COUNT(*) AS n FROM marathon_message_jobs
     WHERE status = 'failed' AND marathon_id IN (${marks}) AND created_at >= ${since}
     GROUP BY marathon_id`,
    ids,
  );
  const notices = await grouped(
    connection,
    `SELECT marathon_id, COUNT(*) AS n FROM marathon_notifications
     WHERE outcome = 'failed' AND marathon_id IN (${marks}) AND sent_at >= ${since}
     GROUP BY marathon_id`,
    ids,
  );
  const tickets = await grouped(
    connection,
    `SELECT marathon_id, COUNT(*) AS n FROM support_tickets
     WHERE status IN ('new', 'in_progress') AND marathon_id IN (${marks})
     GROUP BY marathon_id`,
    ids,
  );
  const peopleById = new Map(people.map((row) => [Number(row.marathon_id), row]));
  const daysById = new Map<number, DayFunnelInput[]>();
  for (const row of dayRows) {
    const list = daysById.get(Number(row.marathon_id)) ?? [];
    list.push({
      day: Number(row.day_number),
      opened: Number(row.opened) || 0,
      completed: Number(row.completed) || 0,
      scoreSum: Number(row.score_sum) || 0,
      scoreCount: Number(row.score_count) || 0,
    });
    daysById.set(Number(row.marathon_id), list);
  }
  const funnels = new Map<number, DailyFunnel>();
  for (const course of courses) {
    const person = peopleById.get(course.id);
    funnels.set(course.id, buildDailyFunnel({
      slug: course.slug,
      daysCount: course.daysCount,
      registered: Number(person?.registered) || 0,
      telegramLinked: Number(person?.telegram_linked) || 0,
      finished: Number(person?.finished) || 0,
      days: daysById.get(course.id) ?? [],
      ticketsOpen: tickets.get(course.id) ?? 0,
      deliveryErrors24h: (outbox.get(course.id) ?? 0) + (jobs.get(course.id) ?? 0) + (notices.get(course.id) ?? 0),
    }));
  }
  return funnels;
}

function zeros(courses: readonly CourseRef[]): Map<number, DailyFunnel> {
  const funnels = new Map<number, DailyFunnel>();
  for (const course of courses) {
    funnels.set(course.id, buildDailyFunnel({
      slug: course.slug,
      daysCount: course.daysCount,
      registered: 0,
      telegramLinked: 0,
      finished: 0,
      days: [],
      ticketsOpen: 0,
      deliveryErrors24h: 0,
    }));
  }
  return funnels;
}

export async function loadDailyFunnelBySlug(slug: string): Promise<DailyFunnel | null> {
  if (!process.env.DB_HOST) return null;
  return withConn(async (connection) => {
    const rows = await connection.query<{ id: number; slug: string; days_count: number }>(
      `SELECT id, slug, days_count FROM marathons WHERE slug = ? AND kind = 'daily' LIMIT 1`,
      [slug],
    );
    const row = rows[0];
    if (!row) return null;
    const funnels = await funnelsFor(connection, [{
      id: Number(row.id),
      slug: String(row.slug),
      daysCount: Number(row.days_count) || 0,
    }]);
    return funnels.get(Number(row.id)) ?? null;
  });
}

/** One read for the admin cards. A missing tickets table stays at zero. */
export async function loadDailyFunnels(courses: readonly CourseRef[]): Promise<Map<number, DailyFunnel>> {
  if (courses.length === 0 || !process.env.DB_HOST) return zeros(courses);
  try {
    return await withConn((connection) => funnelsFor(connection, courses));
  } catch (error) {
    console.error("marathon daily funnel", error);
    return zeros(courses);
  }
}
