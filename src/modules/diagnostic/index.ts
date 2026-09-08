export type { SessionOwner } from "./sessionOwner";
export {
  isValidOwner,
  ownerClause,
  ownerParams,
  ownerKey,
  resolveOwnerForRead,
  resolveOwnerForWrite,
} from "./sessionOwner";

export {
  startDiagnosticTest,
  validateStartDiagnosticTestInput,
  StartDiagnosticTestError,
  DIAGNOSTIC_TASKS_PER_THEME,
  DIAGNOSTIC_MAX_THEMES,
} from "./startDiagnosticTest";
export type {
  StartDiagnosticTestInput,
  StartDiagnosticTestResult,
  StartDiagnosticTestErrorCode,
} from "./startDiagnosticTest";

export { hasEligibleDiagnosticContent } from "./hasEligibleDiagnosticContent";

export {
  checkDiagnosticAnswer,
  CheckDiagnosticAnswerError,
} from "./checkDiagnosticAnswer";
export type {
  CheckDiagnosticAnswerInput,
  CheckDiagnosticAnswerResult,
} from "./checkDiagnosticAnswer";

export {
  finishDiagnosticSession,
  FinishDiagnosticSessionError,
  toDiagnosticSummary,
  DIAGNOSTIC_SUMMARY_THEME_ID,
  DIAGNOSTIC_SUMMARY_THEME_NAME,
} from "./finishDiagnosticSession";
export type { FinishDiagnosticSessionInput } from "./finishDiagnosticSession";

export {
  getDiagnosticSessionTasks,
  GetDiagnosticSessionTasksError,
} from "./getDiagnosticSessionTasks";

export {
  getDiagnosticThemeBreakdown,
  selectPriorityTopics,
  selectStrongTopics,
  toDiagnosticTopicInsight,
  PRIORITY_TOPICS_LIMIT,
  STRONG_TOPICS_LIMIT,
} from "./diagnosticThemeBreakdown";
export type {
  DiagnosticThemeStat,
  DiagnosticTopicInsight,
} from "./diagnosticThemeBreakdown";

export {
  markDiagnosticSessionStarted,
  MarkDiagnosticSessionStartedError,
} from "./markDiagnosticSessionStarted";

export { claimGuestProgress } from "./claimGuestProgress";
export type { ClaimGuestProgressResult } from "./claimGuestProgress";

export {
  startDiagnosticAction,
  checkDiagnosticAnswerAction,
  finishDiagnosticSessionAction,
  markDiagnosticSessionStartedAction,
  getDiagnosticThemeBreakdownAction,
} from "./actions";
export type { StartDiagnosticActionState } from "./actions";
