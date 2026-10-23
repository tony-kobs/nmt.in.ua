export type MarathonStatus = "draft" | "active" | "archived";

export type MarathonRecord = {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  status: MarathonStatus;
  starts_at: number;
  ends_at: number;
  min_tasks_per_session: number;
};

export type MarathonLeaderboardRow = {
  rank: number;
  userId: number;
  displayName: string;
  login: string;
  /** Completed practice sessions. Zero on a daily board. */
  sessionsCount: number;
  /** Submitted days. Zero on the old session board. */
  daysDone: number;
  /** Sum of correct answers. Zero on the old session board. */
  points: number;
  /** Sum of day durations on a daily board. Null on the session board and when any day is unknown. */
  totalTimeSec: number | null;
  avgPercent: number | null;
  avgSecPerTask: number | null;
  isCurrentUser: boolean;
  /** Viewer is a teacher and this row is one of their linked students. */
  isRosterStudent: boolean;
};

export type MarathonBoardOption = {
  slug: string;
  title: string;
  status: string;
};

export type MarathonLeaderboardView = {
  marathon: {
    id: number;
    slug: string;
    title: string;
    description: string | null;
    status: string;
    starts_at: number;
    ends_at: number;
    min_tasks_per_session: number;
    kind: "daily" | "sessions";
  };
  options: MarathonBoardOption[];
  rows: MarathonLeaderboardRow[];
  participantCount: number;
  isParticipant: boolean;
  currentUserRank: number | null;
  rosterParticipantCount: number;
  rosterSize: number;
};
