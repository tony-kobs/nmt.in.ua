import type { RecommendedAction } from "@/modules/recommendations";
import type { LearningSessionRow } from "@/modules/sessions/types";

/** Open mentor assignments shown on the student today screen. */
export const TODAY_ASSIGNMENT_LIMIT = 3;

export type TodayAssignment = {
  sessionId: number;
  themeName: string;
  tasksNumber: number;
  dueAtLabel: string | null;
  canStart: boolean;
  availableAtLabel: string | null;
};

export type TodayMarathonState = "day" | "done" | "setup" | "waiting";

export type TodayMarathon = {
  state: TodayMarathonState;
  title: string;
  dayNumber: number | null;
  topic: string;
  href: string;
};

export type TodayMarathonDay = {
  dayNumber: number;
  topic: string;
  open: boolean;
  completed: boolean;
};

export type TodayAdvice = {
  title: string;
  reason: string;
  href: string;
};

export type TodayJoinOffer = {
  title: string;
  slug: string;
};

export type TodayPlan =
  | { id: "assignment"; assignment: TodayAssignment; more: number }
  | { id: "topic" }
  | { id: "simulator" }
  | { id: "marathon-join"; title: string; href: string }
  | { id: "marathon"; marathon: TodayMarathon }
  | { id: "teacher" }
  | { id: "textbook" }
  | { id: "advice"; advice: TodayAdvice };

export type TodayDiagnostic =
  | {
      kind: "result";
      right: number;
      total: number;
      percentLabel: string;
      /** Weakest theme from the trial. Absent when the paper was clean. */
      themeName: string | null;
      themeHref: string | null;
      perfect: boolean;
    }
  | { kind: "offer" };

export type StudentTodayModel = {
  assignments: TodayAssignment[];
  assignmentsMore: number;
  marathon: TodayMarathon | null;
  join: TodayJoinOffer | null;
  linkedToTeacher: boolean;
  advice: TodayAdvice | null;
  diagnostic: TodayDiagnostic;
};

/** Planned mentor sessions, soonest deadline first. */
export function pickTodayAssignments(
  rows: LearningSessionRow[],
  limit = TODAY_ASSIGNMENT_LIMIT,
): { items: TodayAssignment[]; more: number } {
  const open = rows
    .filter((row) => row.createdBy === "mentor" && row.status === "planned")
    .sort((a, b) => {
      const dueA = a.dueAt ?? Number.MAX_SAFE_INTEGER;
      const dueB = b.dueAt ?? Number.MAX_SAFE_INTEGER;
      return dueA - dueB || a.id - b.id;
    });

  return {
    items: open.slice(0, limit).map((row) => ({
      sessionId: row.id,
      themeName: row.themeName,
      tasksNumber: row.tasksNumber,
      dueAtLabel: row.dueAtLabel,
      canStart: row.canStart,
      availableAtLabel: row.availableAtLabel,
    })),
    more: Math.max(0, open.length - limit),
  };
}

/**
 * The day the student can open now: earliest unlocked day that is not
 * submitted. A finished window stays on the marathon page.
 */
export function pickOpenMarathonDay(input: {
  slug: string;
  title: string;
  days: TodayMarathonDay[];
}): TodayMarathon {
  const mapHref = `/marathon/${encodeURIComponent(input.slug)}/map`;
  const base = { title: input.title, href: mapHref };

  const openDays = input.days.filter((day) => day.open);
  const next = openDays.find((day) => !day.completed);
  if (next) {
    return {
      state: "day",
      title: input.title,
      dayNumber: next.dayNumber,
      topic: next.topic,
      href: `/marathon/${encodeURIComponent(input.slug)}/day/${next.dayNumber}`,
    };
  }

  if (openDays.length > 0) {
    const last = openDays[openDays.length - 1];
    return {
      ...base,
      state: "done",
      dayNumber: last.dayNumber,
      topic: last.topic,
    };
  }

  return { ...base, state: "waiting", dayNumber: null, topic: "" };
}

/** One tip: the first action from the latest session that had mistakes. */
export function pickTodayAdvice(
  actions: RecommendedAction[],
): TodayAdvice | null {
  const first = actions[0];
  if (!first) return null;
  return { title: first.title, reason: first.reason, href: first.href };
}

/**
 * One rail of next steps.
 * A personal item replaces the generic card of the same kind: an open
 * assignment stands in for "take a topic test", a joined marathon stands in
 * for "join", and a tip from mistakes stands in for the textbook.
 */
export function buildTodayPlans(input: {
  assignments: TodayAssignment[];
  assignmentsMore: number;
  marathon: TodayMarathon | null;
  join: TodayJoinOffer | null;
  linkedToTeacher: boolean;
  advice: TodayAdvice | null;
}): TodayPlan[] {
  const plans: TodayPlan[] = [];
  const assignment = input.assignments[0];

  if (assignment) {
    plans.push({
      id: "assignment",
      assignment,
      more: input.assignmentsMore + Math.max(0, input.assignments.length - 1),
    });
  } else {
    plans.push({ id: "topic" });
  }

  plans.push({ id: "simulator" });

  if (input.marathon) {
    plans.push({ id: "marathon", marathon: input.marathon });
  } else if (input.join) {
    plans.push({
      id: "marathon-join",
      title: input.join.title,
      href: `/marathon/${encodeURIComponent(input.join.slug)}`,
    });
  }

  if (!input.linkedToTeacher) {
    plans.push({ id: "teacher" });
  }

  if (input.advice) {
    plans.push({ id: "advice", advice: input.advice });
  } else {
    plans.push({ id: "textbook" });
  }

  return plans;
}
