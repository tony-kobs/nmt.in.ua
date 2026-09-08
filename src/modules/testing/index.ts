/**
 * Модуль 3 — тести та інтерактивні тренажери.
 *
 * Реалізовано:
 * - `/` → TopicTestStart (тема + кількість завдань)
 * - `/session/[id]` → TopicTrainer
 * - `/simulator` → симулятор НМТ (`NmtTrainer`)
 * - `/problems` → задачник (друкований тест по темі)
 * - `/materials` → конспекти
 */

export type TopicTestConfig = {
  topicId: string;
  questionCount: number;
};

export {
  startTopicTest,
  validateStartTopicTestInput,
  StartTopicTestError,
  TOPIC_TEST_TASK_COUNT,
} from "./startTopicTest";
export type {
  StartTopicTestInput,
  StartTopicTestResult,
  StartTopicTestErrorCode,
} from "./startTopicTest";
export {
  startTopicTestAction,
  checkAnswerAction,
  finishTrainerSessionAction,
  markSessionStartedAction,
  type StartTopicTestActionState,
} from "./actions";
export {
  checkAnswer,
  validateCheckAnswerInput,
  CheckAnswerError,
} from "./checkAnswer";
export type {
  CheckAnswerInput,
  CheckAnswerResult,
  CheckAnswerErrorCode,
  AnswerNumber,
} from "./checkAnswer";
export {
  markSessionStarted,
  validateMarkSessionStartedInput,
  MarkSessionStartedError,
} from "./markSessionStarted";
export type {
  MarkSessionStartedInput,
  MarkSessionStartedResult,
  MarkSessionStartedErrorCode,
} from "./markSessionStarted";
export { formatElapsedClock, resolveSessionElapsedSec } from "./sessionElapsed";
export {
  finishTrainerSession,
  validateFinishTrainerSessionInput,
  FinishTrainerSessionError,
  toTrainerSessionSummary,
} from "./finishTrainerSession";
export type {
  FinishTrainerSessionInput,
  FinishTrainerSessionResult,
  FinishTrainerSessionErrorCode,
} from "./finishTrainerSession";
export { getAvailableTopicThemes } from "./getAvailableTopicThemes";
export { getWorkbookThemes, getWorkbookProblems } from "./getProblems";
export type { WorkbookTheme, WorkbookProblem } from "./getProblems";
export {
  getSessionTasks,
  GetSessionTasksError,
  validateSessionId,
} from "./getSessionTasks";
export type { GetSessionTasksErrorCode } from "./getSessionTasks";
export type {
  AvailableTopicTheme,
  SessionTask,
  SessionTasksResult,
  SessionTaskAnswer,
  CheckAnswerActionInput,
  CheckAnswerActionState,
  FinishTrainerSessionActionInput,
  FinishTrainerSessionActionState,
  MarkSessionStartedActionInput,
  MarkSessionStartedActionState,
  TrainerSessionSummary,
} from "./types";
export {
  TASK_STATUS_UNANSWERED,
  TASK_STATUS_CORRECT,
  TASK_STATUS_INCORRECT,
} from "./types";
export {
  resolveTaskPresentation,
  IMPLEMENTED_TASK_FORMATS,
} from "./taskPresentation";
export type {
  TaskFormat,
  ImplementedTaskFormat,
  TaskVisual,
  TaskPresentation,
} from "./taskPresentation";
export {
  resolveAnswerCardState,
  resolveAnswerFeedbackKind,
} from "./answerCardState";
export type {
  AnswerCardVisualState,
  AnswerFeedbackKind,
} from "./answerCardState";

export type TrainerSession = {
  id: string;
  topicId: string;
  startedAt: string;
  answers: unknown[];
};

/** Симулятор повного НМТ (окремий flow від короткого тесту). */

export {
  startNmtSimulator,
  StartNmtSimulatorError,
  NMT_SIMULATOR_TASK_COUNT,
  SESSION_TYPE_NMT_SIMULATOR,
} from "./startNmtSimulator";
