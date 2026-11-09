import "server-only";

import { selectStudentMarathonShelf, type ShelfCard } from "../shelf";
import { isoDate, withConn, type Conn } from "./db";
import { finishElapsedOn } from "./lifecycle";

/** Active courses for everyone, plus finished courses this student joined. */
export async function listStudentMarathonShelf(
  userId: number,
  getConnection?: Conn,
): Promise<ShelfCard[]> {
  return withConn(async (connection) => {
    await finishElapsedOn(connection, new Date());
    const rows = await connection.query<{
      slug: string;
      title: string;
      description: string | null;
      status: string;
      days_count: number;
      start_date: unknown;
    }>(
      `SELECT slug, title, description, status, days_count, start_date
       FROM marathons
       WHERE kind = 'daily' AND status IN ('active', 'finished')
       ORDER BY start_date DESC, id DESC`,
      [],
    );
    const joined = await connection.query<{ slug: string }>(
      `SELECT m.slug
       FROM marathon_participants p
       INNER JOIN marathons m ON m.id = p.marathon_id
       WHERE p.user_id = ? AND m.kind = 'daily'`,
      [userId],
    );
    return selectStudentMarathonShelf({
      marathons: rows.flatMap((row) => {
        if (row.status !== "active" && row.status !== "finished") return [];
        const startDate = isoDate(row.start_date);
        if (!startDate) return [];
        return [
          {
            slug: row.slug,
            title: row.title,
            description: String(row.description ?? ""),
            status: row.status,
            daysCount: Number(row.days_count),
            startDate,
          },
        ];
      }),
      joinedSlugs: new Set(joined.map((row) => row.slug)),
    });
  }, getConnection);
}
