import "server-only";

import { unstable_cache } from "next/cache";
import type { SqlConnection } from "@/lib/db/mysql";
import { currentDayNumber } from "../calendar";
import {
  selectFeaturedHomeMarathon,
  selectHomeMarathonCards,
  type HomeBoardRow,
  type HomeMarathonCard,
  type HomeMarathonSpotlight,
} from "../homeCard";
import { selectMarathonInvites, type MarathonInvite } from "../invite";
import { composeBoard } from "./board";
import { MARATHON_HOME_CACHE_TAG } from "./cache";
import { isoDate, withConn, type Conn } from "./db";

async function buildHomeSpotlight(
  connection: SqlConnection,
  card: HomeMarathonCard,
  row: {
    id: number;
    start_date: string | null;
    unlock_hour: string | null;
    days_count: number | string | null;
  },
): Promise<HomeMarathonSpotlight> {
  const daysCount = Math.max(1, Math.floor(Number(row.days_count)) || 1);
  const dayNumber = currentDayNumber({
    now: new Date(),
    startDate: isoDate(row.start_date),
    unlockHour: String(row.unlock_hour ?? "09:00").slice(0, 5),
    daysCount,
  }) ?? 1;
  let board: HomeBoardRow[] = [];
  try {
    const lines = await composeBoard(connection, Number(row.id), false);
    board = lines.map((line) => ({
      userId: line.userId,
      place: line.place,
      name: line.name,
      points: line.points,
    }));
  } catch (error) {
    console.error("marathon home board", error);
  }
  return {
    ...card,
    imageUrl: null,
    dayNumber,
    daysCount,
    board,
  };
}

/** Guest cards on `/` and `/welcome`. Personalized home stays uncached. */
export function loadGuestMarathonHomeState(): Promise<{
  cards: HomeMarathonCard[];
  invites: MarathonInvite[];
  spotlight: HomeMarathonSpotlight | null;
}> {
  const load = () => loadMarathonHomeState({ userId: null, role: null });
  try {
    return unstable_cache(load, ["marathon-home-guest"], {
      revalidate: 60,
      tags: [MARATHON_HOME_CACHE_TAG],
    })();
  } catch {
    return load();
  }
}

export async function loadMarathonHomeState(
  input: { userId: number | null; role: string | null },
  getConnection?: Conn,
): Promise<{
  cards: HomeMarathonCard[];
  invites: MarathonInvite[];
  spotlight: HomeMarathonSpotlight | null;
}> {
  return withConn(async (connection) => {
    const marathons = await connection.query<{
      id: number;
      slug: string;
      title: string;
      description: string | null;
      status: string;
      start_date: string | null;
      unlock_hour: string | null;
      days_count: number | string | null;
    }>(
      `SELECT id, slug, title, description, status, start_date, unlock_hour, days_count
       FROM marathons
       WHERE kind = 'daily' AND status = 'active'
       ORDER BY id DESC`,
      [],
    );
    let joinedSlugs = new Set<string>();
    let declinedSlugs = new Set<string>();
    let joinedIds = new Set<number>();
    let declinedIds = new Set<number>();
    if (input.userId != null) {
      const joined = await connection.query<{ id: number; slug: string }>(
        `SELECT m.id, m.slug
         FROM marathon_participants p
         INNER JOIN marathons m ON m.id = p.marathon_id
         WHERE p.user_id = ? AND m.kind = 'daily'`,
        [input.userId],
      );
      joinedSlugs = new Set(joined.map((row) => row.slug));
      joinedIds = new Set(joined.map((row) => Number(row.id)));
      const declined = await connection.query<{ id: number; slug: string }>(
        `SELECT m.id, m.slug
         FROM marathon_declines d
         INNER JOIN marathons m ON m.id = d.marathon_id
         WHERE d.user_id = ?`,
        [input.userId],
      );
      declinedSlugs = new Set(declined.map((row) => row.slug));
      declinedIds = new Set(declined.map((row) => Number(row.id)));
    }
    let invitedIds = new Set<number>();
    if (input.userId != null) {
      const invited = await connection.query<{ marathon_id: number }>(
        `SELECT marathon_id FROM marathon_invite_recipients WHERE user_id = ?`,
        [input.userId],
      );
      invitedIds = new Set(invited.map((row) => Number(row.marathon_id)));
    }
    const cards = selectHomeMarathonCards({
      marathons: marathons.map((row) => ({
        slug: row.slug,
        title: row.title,
        description: String(row.description ?? ""),
        status: row.status,
      })),
      joinedSlugs,
      declinedSlugs,
    });
    const featured = selectFeaturedHomeMarathon(cards);
    const featuredRow = featured
      ? marathons.find((row) => row.slug === featured.slug) ?? null
      : null;
    return {
      cards,
      spotlight: featured && featuredRow
        ? await buildHomeSpotlight(connection, featured, featuredRow)
        : null,
      invites: selectMarathonInvites({
        marathons: marathons.map((row) => ({
          id: Number(row.id),
          slug: row.slug,
          title: row.title,
          status: row.status,
        })),
        joinedIds,
        declinedIds,
        invitedIds,
      }),
    };
  }, getConnection);
}
