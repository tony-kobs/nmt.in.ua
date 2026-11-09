import type { InviteAudience } from "../invite";
import type { PendingPlayTask } from "../playTasks";

export type DailyStatus = "draft" | "active" | "finished" | "archived";
export type MaterialType = "loom" | "youtube" | "text";

export type DailyMarathon = {
  id: number;
  slug: string;
  title: string;
  description: string;
  subject: string;
  startDate: string;
  unlockHour: string;
  reminderHour: string;
  nudgeFrom: number;
  nudgeUntil: number;
  daysCount: number;
  passThreshold: number;
  finalCtaText: string;
  finalCtaUrl: string;
  introVideoUrl: string;
  /** Who is invited once, when the course first becomes active. Drafts default to nobody. */
  inviteAudience: InviteAudience;
  /** How many bank riddles the public landing draws on each visit. */
  landingRiddleCount: number;
  /** Public participant chat. Empty when the marathon has none. */
  publicChatUrl: string;
  status: DailyStatus;
};

export type MarathonDay = {
  id: number;
  dayNumber: number;
  topic: string;
  introText: string | null;
  /** Relative public path. Empty when the day has no photo. */
  imageUrl?: string | null;
};

export type Material = {
  id: number;
  order: number;
  type: MaterialType;
  urlOrBody: string;
};

export type PlayTask = PendingPlayTask;

export type Participant = {
  userId: number;
  source: string | null;
  streak: number;
  finishedAt: string | null;
  convertedAt: string | null;
  telegramChatId: string | null;
  notifyEmail: boolean;
  notifyBot: boolean;
  channel: "site" | "telegram" | null;
  introSeen: boolean;
  notifyPaused: boolean;
  email: string | null;
  displayName: string;
};

export type DayProgress = {
  dayId: number;
  dayNumber: number;
  materialsViewed: boolean;
  score: number | null;
  passed: boolean;
  completedAt: number | null;
  startedAt: number | null;
  submittedAt: number | null;
  durationSeconds: number | null;
  answers: Record<number, number>;
  correctCount: number | null;
};

export type ParticipantReport = {
  userId: number;
  displayName: string;
  login: string;
  email: string | null;
  emailVerified: boolean;
  source: string | null;
  streak: number;
  finished: boolean;
  converted: boolean;
  days: Array<{ dayNumber: number; score: number | null; passed: boolean; completed: boolean }>;
};
