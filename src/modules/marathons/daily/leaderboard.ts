import {
  renderResolved,
  type CopyKey,
  type CopyVars,
} from "./copy";

/** How many rows the participant sees before their own line. */
export const BOARD_TOP = 10;

export type RankInput = {
  userId: number;
  displayName: string;
  points: number;
  lastCompletedAt: number | null;
  streak: number;
  joinedAt: number;
};

export type Ranked = RankInput & {
  place: number;
  prevPlace: number | null;
};

export type RankTone = "up" | "down" | "same" | "first" | "nudge";

const TONE_KEY = {
  up: "rank_up",
  down: "rank_down",
  same: "rank_same",
  first: "rank_first",
  nudge: "rank_nudge",
} as const satisfies Record<RankTone, CopyKey>;

/**
 * Higher points first. A tie goes to whoever finished their latest day earlier.
 * No completion is worse than any completion. Then earlier join, then user id.
 */
export function rankParticipants(rows: RankInput[]): Ranked[] {
  const sorted = [...rows].sort((a, b) => {
    if (a.points !== b.points) return b.points - a.points;
    const aDone = a.lastCompletedAt ?? Number.POSITIVE_INFINITY;
    const bDone = b.lastCompletedAt ?? Number.POSITIVE_INFINITY;
    if (aDone !== bDone) return aDone - bDone;
    if (a.joinedAt !== b.joinedAt) return a.joinedAt - b.joinedAt;
    return a.userId - b.userId;
  });
  return sorted.map((row, index) => ({ ...row, place: index + 1, prevPlace: null }));
}

/** `previous` is the place stored before this snapshot. A first appearance has no previous place. */
export function applyRankSnapshot(
  previous: ReadonlyMap<number, number>,
  ranked: Ranked[],
): Ranked[] {
  return ranked.map((row) => ({
    ...row,
    prevPlace: previous.has(row.userId) ? (previous.get(row.userId) ?? null) : null,
  }));
}

export function rankTone(input: {
  completed: boolean;
  place: number;
  prevPlace: number | null;
}): RankTone {
  if (!input.completed) return "nudge";
  if (input.place === 1) return "first";
  if (input.prevPlace == null || input.prevPlace === input.place) return "same";
  if (input.place < input.prevPlace) return "up";
  return "down";
}

export function rankCopyKey(tone: RankTone): CopyKey {
  return TONE_KEY[tone];
}

export function buildRankVars(input: {
  name: string;
  place: number;
  prevPlace: number | null;
  points: number;
  day: number;
  link?: string;
}): CopyVars {
  const delta = input.prevPlace == null ? 0 : Math.abs(input.prevPlace - input.place);
  return {
    name: input.name,
    place: input.place,
    prev_place: input.prevPlace ?? input.place,
    delta,
    total: input.points,
    day: input.day,
    link: input.link ?? "",
  };
}

export function rankNoticeText(
  copy: Partial<Record<CopyKey, string>> | null | undefined,
  input: {
    name: string;
    place: number;
    prevPlace: number | null;
    points: number;
    day: number;
    link?: string;
  },
): string {
  const tone = rankTone({
    completed: true,
    place: input.place,
    prevPlace: input.prevPlace,
  });
  return renderResolved(rankCopyKey(tone), copy, buildRankVars({
    ...input,
    name: publicLeaderName(input.name),
  }));
}

/** First name plus the initial of the second word. An address never leaves the local part. */
export function publicLeaderName(displayName: string | null | undefined): string {
  const raw = (displayName ?? "").trim();
  if (!raw) return "Учасник";
  const base = raw.includes("@") ? raw.slice(0, raw.indexOf("@")).trim() : raw;
  const parts = base.split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return "Учасник";
  const second = parts[1];
  if (!second) return first;
  const initial = Array.from(second)[0];
  return initial ? `${first} ${initial}.` : first;
}

export type BoardLine = {
  userId: number;
  place: number;
  prevPlace: number | null;
  points: number;
  streak: number;
  name: string;
};

export function visibleBoard<T extends { userId: number }>(
  rows: T[],
  userId: number | null,
  limit = BOARD_TOP,
): { top: T[]; self: T | null; selfOutside: boolean } {
  const top = rows.slice(0, limit);
  if (userId == null) return { top, self: null, selfOutside: false };
  const self = rows.find((row) => row.userId === userId) ?? null;
  const selfOutside = Boolean(self && !top.some((row) => row.userId === userId));
  return { top, self, selfOutside };
}

export function formatBoardMessage(input: {
  title: string;
  rows: Array<{ place: number; name: string; points: number; streak: number }>;
  self: { place: number; name: string; points: number; streak: number } | null;
  selfOutside: boolean;
}): string {
  const line = (row: { place: number; name: string; points: number; streak: number }) => {
    const streak = row.streak > 0 ? ` · серія ${row.streak}` : "";
    return `${row.place}. ${row.name} — ${row.points}${streak}`;
  };
  const lines = [input.title.trim(), ""];
  for (const row of input.rows) lines.push(line(row));
  if (input.self && input.selfOutside) {
    lines.push("…");
    lines.push(line(input.self));
  }
  return lines.filter((item, index) => item !== "" || index === 1).join("\n").trim();
}
