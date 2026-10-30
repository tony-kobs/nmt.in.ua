import { dayUnlockAt, isDayUnlocked } from "./calendar";

/** Daily courses a public URL can show. Archived rows stay off the sitemap. */
export const SITEMAP_DAILY_STATUSES = ["draft", "active", "finished"] as const;

export type PublicMarathonPhase = "hidden" | "parking" | "open" | "finished";

export type PublicMarathonClock = {
  status: string;
  startDate: string;
  unlockHour: string;
  daysCount: number;
};

/**
 * What `/marathon/{slug}` should render.
 * Draft is shareable immediately. Active stays on the waiting page until day 1
 * unlocks in Europe/Kyiv. A missing or unreadable start stays on that page too.
 * Finished keeps the results page. Archived and unknown rows are a real 404.
 */
export function publicMarathonPhase(
  marathon: PublicMarathonClock | null,
  now: Date,
): PublicMarathonPhase {
  if (!marathon) return "hidden";
  if (marathon.status === "finished") return "finished";
  if (marathon.status === "draft") return "parking";
  if (marathon.status !== "active") return "hidden";
  try {
    const open = isDayUnlocked(now, {
      startDate: marathon.startDate,
      unlockHour: marathon.unlockHour,
      dayNumber: 1,
    });
    return open ? "open" : "parking";
  } catch {
    return "parking";
  }
}

/** Day-1 unlock, or null when the schedule cannot be read. */
export function marathonOpensAt(marathon: Pick<PublicMarathonClock, "startDate" | "unlockHour">): Date | null {
  try {
    return dayUnlockAt({
      startDate: marathon.startDate,
      unlockHour: marathon.unlockHour,
      dayNumber: 1,
    });
  } catch {
    return null;
  }
}

/**
 * Where registration lands. A course that is not open yet returns to the
 * public waiting page. An active course with no schedule fields (older
 * callers that only know the status) still opens the map.
 */
export function marathonJoinNextPath(
  slug: string,
  marathon: {
    status: string;
    startDate?: string;
    unlockHour?: string;
    daysCount?: number;
  },
  now = new Date(),
): string {
  const waiting = `/marathon/${slug}?joined=1`;
  if (marathon.status === "draft") return waiting;
  if (marathon.status === "active" && marathon.startDate !== undefined) {
    const phase = publicMarathonPhase(
      {
        status: "active",
        startDate: marathon.startDate,
        unlockHour: marathon.unlockHour ?? "",
        daysCount: marathon.daysCount ?? 1,
      },
      now,
    );
    if (phase === "parking") return waiting;
  }
  return `/marathon/${slug}/map`;
}

/** Calendar day from a DATE/CHAR value. Empty when the value is not a date. */
export function calendarDate(value: unknown): string {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) {
    return calendarDate(value.toString("utf8"));
  }
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(value ?? "").trim());
  return match?.[1] ?? "";
}
