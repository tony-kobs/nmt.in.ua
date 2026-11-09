import "server-only";

export {
  deleteRiddle,
  getRiddleById,
  insertRiddle,
  listRiddles,
  loadLandingRiddles,
  updateRiddle,
} from "./riddleStore";

export type { StoredRiddle as Riddle } from "./riddleQuiz";

export type {
  DailyMarathon,
  DailyStatus,
  DayProgress,
  MarathonDay,
  Material,
  MaterialType,
  Participant,
  ParticipantReport,
  PlayTask,
} from "./store/types";

export {
  deleteDailyMarathon,
  getDailyById,
  getDailyBySlug,
  getPublicDailyBySlug,
  insertDailyMarathon,
  listDailyMarathons,
  setDailyStatus,
  updateDailyMarathon,
} from "./store/marathons";

export {
  deleteDay,
  insertDay,
  listContentDayNumbers,
  listDayTaskCounts,
  listDays,
  updateDay,
} from "./store/days";

export {
  deleteMaterial,
  insertMaterial,
  listMaterials,
  updateMaterial,
} from "./store/materials";

export {
  deleteTask,
  insertTask,
  listAdminTasks,
  listPendingTasks,
  listTaskReview,
  quizTaskExists,
  searchQuizTasks,
} from "./store/tasks";

export {
  findArchivedMarathonByChat,
  findParticipantByChat,
  getParticipant,
  joinParticipant,
  listChatMarathons,
  selectChatMarathon,
} from "./store/participants";

export type { DayCompletion, RankStanding } from "./store/progress";
export {
  completeParticipantDay,
  listProgress,
  markDayTestStarted,
  markMaterialsViewed,
  recordMaterialsDelivered,
  savePartialAnswers,
} from "./store/progress";

export type { MarathonPauseState } from "./store/prefs";
export {
  loadMarathonCopy,
  markConverted,
  markIntroSeen,
  pauseMarathonNotifications,
  resetMarathonCopy,
  saveMarathonCopy,
  setDeliveryChannel,
  setMarathonNotificationsPaused,
  setNotifyPrefs,
  setNotifyToggles,
  silenceEmail,
  listMarathonPauseStates,
} from "./store/prefs";

export { listParticipantReports } from "./store/reports";

export type { NotifyAudienceMarathon } from "./store/audience";
export { loadNotifyAudience } from "./store/audience";

export { finishElapsedDailyMarathons } from "./store/lifecycle";

export { loadMarathonBoard, refreshDailyPoints } from "./store/board";

export {
  STALE_NOTIFICATION_CLAIM_MINUTES,
  claimNotification,
  confirmNotification,
  releaseNotification,
} from "./store/claims";

export { listStudentMarathonShelf } from "./store/shelfList";

export {
  consumeMarathonBotToken,
  marathonCallbackFromStoredLabel,
  rememberMarathonButtonLabels,
  replaceMarathonBotTokens,
} from "./store/bot";

export type { TelegramOutboxRow } from "./store/outbox";
export {
  claimMarathonTelegram,
  declineMarathon,
  enqueueMarathonTelegram,
  finishMarathonTelegram,
  noteMarathonTelegram,
  postponeMarathonTelegram,
} from "./store/outbox";

export {
  MARATHON_HOME_CACHE_TAG,
  invalidateMarathonHomeCache,
} from "./store/cache";
export { loadGuestMarathonHomeState, loadMarathonHomeState } from "./store/home";
