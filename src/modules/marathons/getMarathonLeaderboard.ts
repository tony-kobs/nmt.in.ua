import "server-only";
import type { SqlConnection } from "@/lib/db/mysql";
import { SESSION_STATUS_COMPLETED } from "@/modules/sessions/types";
import {
  ALL_MARATHONS_SLUG,
  buildDailyBoard,
  earliestDailyPeople,
  pickMarathonSlug,
  sortBoardChoices,
  type DailyDayResult,
  type MarathonBoardKind,
} from "./boardStats";
import { refreshDailyPoints } from "./daily/store";
import { closeExpiredMarathons } from "./schema";
import {
  aggregateSessions,
  compareStandings,
  countsTowardMarathon,
  type SessionAggregateInput,
} from "./scoring";
import type {
  MarathonLeaderboardRow,
  MarathonLeaderboardView,
  MarathonRecord,
} from "./types";

type ParticipantRow = {
  user_id: number;
  display_name: string;
  login: string;
  joined_at: number | string;
};

type SessionRow = {
  user_id: number;
  tasks_number: number;
  right_number: number;
  time: number;
  start_time: number;
};

async function loadDefaultConnection(): Promise<SqlConnection> {
  const { getConnection } = await import("@/lib/db/mysql");
  return getConnection();
}

function mapMarathon(row: MarathonRecord): MarathonRecord {
  return row;
}

function decorate(
  row: {
    rank: number;
    userId: number;
    displayName: string;
    login: string;
    sessionsCount: number;
    daysDone: number;
    points: number;
    avgPercent: number | null;
    avgSecPerTask: number | null;
  },
  viewerUserId: number,
  rosterStudentIds: ReadonlySet<number>,
): MarathonLeaderboardRow {
  return {
    ...row,
    isCurrentUser: row.userId === viewerUserId,
    isRosterStudent: rosterStudentIds.has(row.userId),
  };
}

async function loadParticipants(
  connection: SqlConnection,
  marathonIds: readonly number[],
): Promise<ParticipantRow[]> {
  if (marathonIds.length === 0) return [];
  const placeholders = marathonIds.map(() => "?").join(", ");
  return connection.query<ParticipantRow>(
    `SELECT mp.user_id, u.display_name, u.login,
            UNIX_TIMESTAMP(mp.joined_at) AS joined_at
     FROM marathon_participants mp
     INNER JOIN app_users u ON u.id = mp.user_id AND u.is_banned = 0
     WHERE mp.marathon_id IN (${placeholders})
     ORDER BY u.display_name, mp.joined_at`,
    [...marathonIds],
  );
}

async function dailyRows(
  connection: SqlConnection,
  marathonIds: readonly number[],
  participants: ParticipantRow[],
  viewerUserId: number,
  rosterStudentIds: ReadonlySet<number>,
): Promise<MarathonLeaderboardRow[]> {
  for (const marathonId of marathonIds) {
    await refreshDailyPoints(connection, marathonId);
  }
  if (marathonIds.length === 0) return [];
  const placeholders = marathonIds.map(() => "?").join(", ");
  const progress = await connection.query<{
    marathon_id: number | null;
    user_id: number;
    day_id: number | null;
    score: number | null;
    correct_count: number | null;
    completed_at: number | string | null;
  }>(
    `SELECT pr.marathon_id, pr.user_id, pr.day_id, pr.score, pr.correct_count,
            UNIX_TIMESTAMP(pr.completed_at) AS completed_at
     FROM marathon_day_progress pr
     WHERE pr.marathon_id IN (${placeholders}) AND pr.completed_at IS NOT NULL`,
    [...marathonIds],
  );
  const days: DailyDayResult[] = progress
    .filter((row) => row.day_id != null)
    .map((row) => ({
      userId: Number(row.user_id),
      dayId: Number(row.day_id),
      marathonId: row.marathon_id == null ? undefined : Number(row.marathon_id),
      score: row.score == null ? null : Number(row.score),
      correctCount: Number(row.correct_count) || 0,
      completedAt: Number(row.completed_at) * 1000 || null,
    }));
  const people = earliestDailyPeople(
    participants.map((person) => ({
      userId: person.user_id,
      displayName: person.display_name,
      login: person.login,
      joinedAt: Number(person.joined_at) * 1000 || 0,
      streak: 0,
    })),
  );
  return buildDailyBoard(people, days).map((row) => decorate({
    rank: row.rank,
    userId: row.userId,
    displayName: row.displayName,
    login: row.login,
    sessionsCount: 0,
    daysDone: row.daysDone,
    points: row.points,
    avgPercent: row.avgPercent,
    avgSecPerTask: row.avgSecPerTask,
  }, viewerUserId, rosterStudentIds));
}

async function sessionRows(
  connection: SqlConnection,
  marathon: { starts_at: number; ends_at: number; min_tasks_per_session: number },
  participants: ParticipantRow[],
  participantIds: number[],
  viewerUserId: number,
  rosterStudentIds: ReadonlySet<number>,
): Promise<MarathonLeaderboardRow[]> {
  const placeholders = participantIds.map(() => "?").join(", ");
  const sessions = await connection.query<SessionRow>(
    `SELECT user_id, tasks_number, right_number, time, start_time
     FROM task_sessions
     WHERE user_id IN (${placeholders})
       AND session_status = ?
       AND start_time >= ?
       AND start_time <= ?`,
    [
      ...participantIds,
      SESSION_STATUS_COMPLETED,
      marathon.starts_at,
      marathon.ends_at,
    ],
  );
  const joinedAtByUser = new Map(
    participants.map((participant) => [participant.user_id, Number(participant.joined_at)]),
  );
  const sessionsByUser = new Map<number, SessionAggregateInput[]>();
  for (const session of sessions) {
    const joinedAtUnix = joinedAtByUser.get(session.user_id);
    if (
      joinedAtUnix == null ||
      !Number.isFinite(joinedAtUnix) ||
      !countsTowardMarathon({
        startTime: Number(session.start_time),
        marathonStartsAt: Number(marathon.starts_at),
        marathonEndsAt: Number(marathon.ends_at),
        joinedAtUnix,
      })
    ) {
      continue;
    }
    const list = sessionsByUser.get(session.user_id) ?? [];
    list.push({
      tasksNumber: session.tasks_number,
      rightNumber: session.right_number,
      timeSec: session.time,
    });
    sessionsByUser.set(session.user_id, list);
  }
  const standings = participants.map((participant) => ({
    participant,
    agg: aggregateSessions(
      sessionsByUser.get(participant.user_id) ?? [],
      marathon.min_tasks_per_session,
    ),
  }));
  standings.sort((a, b) => compareStandings(a.agg, b.agg));
  return standings.map((entry, index) => decorate({
    rank: index + 1,
    userId: entry.participant.user_id,
    displayName: entry.participant.display_name,
    login: entry.participant.login,
    sessionsCount: entry.agg.sessionsCount,
    daysDone: 0,
    points: 0,
    avgPercent: entry.agg.avgPercent,
    avgSecPerTask: entry.agg.avgSecPerTask,
  }, viewerUserId, rosterStudentIds));
}

export async function getActiveMarathon(
  getConnection: () => Promise<SqlConnection> = loadDefaultConnection,
): Promise<MarathonRecord | null> {
  await closeExpiredMarathons(getConnection);
  const now = Math.floor(Date.now() / 1000);
  const connection = await getConnection();
  try {
    const rows = await connection.query<MarathonRecord>(
      `SELECT id, slug, title, description, status, starts_at, ends_at, min_tasks_per_session
       FROM marathons
       WHERE status = 'active' AND kind = 'leaderboard' AND starts_at <= ? AND ends_at > ?
       ORDER BY starts_at DESC
       LIMIT 1`,
      [now, now],
    );
    const row = rows[0];
    return row ? mapMarathon(row) : null;
  } finally {
    connection.release();
  }
}

export type GetMarathonLeaderboardOptions = {
  marathonSlug?: string;
  /** When set (teacher), rows for these user ids get `isRosterStudent`. */
  rosterStudentIds?: ReadonlySet<number>;
};

type ListedMarathon = {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  status: string;
  starts_at: number;
  ends_at: number;
  min_tasks_per_session: number;
  kind: string;
};

const LIST_SQL = `
  SELECT id, slug, title, description, status, starts_at, ends_at, min_tasks_per_session, kind
  FROM marathons
  WHERE (kind = 'daily' AND status IN ('active', 'finished'))
     OR (kind = 'leaderboard' AND status = 'active')
`;

function boardKind(kind: string): MarathonBoardKind {
  return kind === "daily" ? "daily" : "sessions";
}

export async function getMarathonLeaderboard(
  viewerUserId: number,
  options: GetMarathonLeaderboardOptions = {},
  getConnection: () => Promise<SqlConnection> = loadDefaultConnection,
): Promise<MarathonLeaderboardView | null> {
  const rosterStudentIds = options.rosterStudentIds ?? new Set<number>();
  await closeExpiredMarathons(getConnection);
  const now = Math.floor(Date.now() / 1000);
  const connection = await getConnection();
  try {
    const listed = await connection.query<ListedMarathon>(LIST_SQL, []);
    const choices = sortBoardChoices(
      listed
        .filter((row) => {
          if (row.kind === "daily") return row.status === "active" || row.status === "finished";
          return (
            row.kind === "leaderboard" &&
            row.status === "active" &&
            Number(row.starts_at) <= now &&
            Number(row.ends_at) > now
          );
        })
        .map((row) => ({
          ...row,
          slug: row.slug,
          kind: boardKind(row.kind),
          status: row.status,
          startsAt: Number(row.starts_at),
          id: Number(row.id),
        })),
    );
    const slug = pickMarathonSlug(choices, options.marathonSlug);
    const selected = slug === ALL_MARATHONS_SLUG
      ? null
      : choices.find((row) => row.slug === slug);
    if (slug !== ALL_MARATHONS_SLUG && (!selected || selected.status === "draft")) return null;
    const dailyChoices = choices.filter((row) => row.kind === "daily");
    const marathon = selected
      ? {
          id: Number(selected.id),
          slug: selected.slug,
          title: selected.title,
          description: selected.description,
          status: selected.status,
          starts_at: Number(selected.starts_at),
          ends_at: Number(selected.ends_at),
          min_tasks_per_session: Number(selected.min_tasks_per_session),
          kind: selected.kind,
        }
      : {
          id: 0,
          slug: ALL_MARATHONS_SLUG,
          title: "",
          description: null,
          status: "active",
          starts_at: 0,
          ends_at: 0,
          min_tasks_per_session: 0,
          kind: "daily" as const,
        };
    const boardOptions = [
      ...(dailyChoices.length > 0
        ? [{ slug: ALL_MARATHONS_SLUG, title: "", status: "all" }]
        : []),
      ...choices.map((row) => ({
        slug: row.slug,
        title: row.title,
        status: row.status,
      })),
    ];
    const marathonIds = slug === ALL_MARATHONS_SLUG
      ? dailyChoices.map((row) => row.id)
      : [marathon.id];

    const participants = await loadParticipants(connection, marathonIds);

    const participantIds = [
      ...new Set(participants.map((person) => person.user_id)),
    ];
    const isParticipant = participantIds.includes(viewerUserId);

    const empty = {
      marathon,
      options: boardOptions,
      rows: [] as MarathonLeaderboardRow[],
      participantCount: 0,
      isParticipant,
      currentUserRank: null,
      rosterParticipantCount: 0,
      rosterSize: rosterStudentIds.size,
    };
    if (participantIds.length === 0) return empty;

    const rows = marathon.kind === "daily"
      ? await dailyRows(connection, marathonIds, participants, viewerUserId, rosterStudentIds)
      : await sessionRows(
          connection,
          marathon,
          participants,
          participantIds,
          viewerUserId,
          rosterStudentIds,
        );

    const current = rows.find((row) => row.isCurrentUser);
    const rosterParticipantCount = rows.filter((row) => row.isRosterStudent).length;

    return {
      marathon,
      options: boardOptions,
      rows,
      participantCount: participantIds.length,
      isParticipant,
      currentUserRank: current?.rank ?? null,
      rosterParticipantCount,
      rosterSize: rosterStudentIds.size,
    };
  } finally {
    connection.release();
  }
}
