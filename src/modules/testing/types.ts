import type { TopicTestMode } from "./topicTestMode";

export type AvailableTopicTheme = {
  id: number;
  code: string;
  name: string;
  ord: number;
  taskCount: number;
};

/** One answer option exposed to the client (no correctness metadata). */
export type SessionTaskAnswer = {
  number: 1 | 2 | 3 | 4 | 5;
  text: string;
};

export type NmtTaskKind = "mcq" | "match" | "open";

/** Quiz task payload safe to render before answer check / session finish. */
export type SessionTask = {
  mappingId: number;
  taskId: number;
  name: string;
  taskText: string;
  answers: SessionTaskAnswer[];
  status: number;
  /** Present on simulator tasks from `nmt_quiz_tasks`. Topic tests omit it. */
  taskKind?: NmtTaskKind;
};

/** Client-safe session score after finish (no answer key). */
export type TrainerSessionSummary = {
  sessionId: number;
  rightNumber: number;
  tasksNumber: number;
  percent: number;
  timeSec: number;
  themeId: number;
  /** `null` for a diagnostic attempt or NMT variant (no single textbook section). */
  themeCode: string | null;
  themeName: string;
};

export type SessionTasksResult = {
  sessionId: number;
  sessionStatus: number;
  themeId: number;
  /** `null` for a diagnostic attempt — see `TrainerSessionSummary.themeCode`. */
  themeCode: string | null;
  themeName: string;
  tasks: SessionTask[];
  summary: TrainerSessionSummary | null;
  /** Planned auto/mentor row without task mappings yet — needs `startPlannedSession`. */
  isPlannedWithoutTasks?: boolean;
};

/** Verified `tasks2session.status` values (team DB). */
export const TASK_STATUS_UNANSWERED = 0;
export const TASK_STATUS_CORRECT = 1;
export const TASK_STATUS_INCORRECT = -1;

export type CheckAnswerActionInput = {
  sessionId: number;
  mappingId: number;
  answerNumber?: 1 | 2 | 3 | 4 | 5;
  /** Open / matching NMT answers (e.g. "-35" or "1b;2c;3a"). */
  answerText?: string;
};

export type CheckAnswerErrorCode =
  | "invalidInput"
  | "notFound"
  | "sessionCompleted"
  | "generic";

export type CheckAnswerActionState =
  | { status: "success"; correct: boolean }
  | { status: "error"; code: CheckAnswerErrorCode };
export type FinishTrainerSessionActionInput = {
  sessionId: number;
  locale?: "uk" | "en" | "de";
  markUnansweredAsIncorrect?: boolean;
  capTimeSec?: number;
};

import type { RecommendedAction } from "@/modules/recommendations";

export type FinishTrainerSessionErrorCode =
  | "invalidInput"
  | "notFound"
  | "unfinished"
  | "generic";

export type FinishTrainerSessionActionState =
  | {
      status: "success";
      summary: TrainerSessionSummary;
      recommendations: RecommendedAction[];
    }
  | { status: "error"; code: FinishTrainerSessionErrorCode };

export type SkipTaskAnswerActionInput = {
  sessionId: number;
  mappingId: number;
};

export type SkipTaskAnswerErrorCode =
  | "notFound"
  | "sessionCompleted"
  | "generic";

export type SkipTaskAnswerActionState =
  | { status: "success"; correct: false }
  | { status: "error"; code: SkipTaskAnswerErrorCode };

export type { TopicTestMode } from "./topicTestMode";

/** `TopicTestMode` plus diagnostic and NMT simulator. Diagnostic behaves like
 * "standard" in TopicTrainer (immediate feedback, no Ultimate timer) — it
 * only needs its own branch for copy/CTA differences in the summary.
 * NMT shows per-task mistake review + theme recommendations after finish. */
export type TrainerMode = TopicTestMode | "diagnostic" | "nmt";

export type MarkSessionStartedActionInput = {
  sessionId: number;
};

export type MarkSessionStartedErrorCode =
  | "invalidInput"
  | "notFound"
  | "generic";

export type MarkSessionStartedActionState =
  | { status: "success"; startTime: number }
  | { status: "error"; code: MarkSessionStartedErrorCode };
