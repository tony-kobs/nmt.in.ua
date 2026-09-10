export type {
  ConsultationRequest,
  ConsultationRequestView,
  ConsultationStatus,
  OpenConsultationStatus,
} from "./types";
export {
  CONSULTATION_LIST_LIMIT,
  CONSULTATION_STATUSES,
  NOTE_MAX_LEN,
  OPEN_CONSULTATION_STATUSES,
  canTransitionConsultationStatus,
  isConsultationStatus,
  isOpenConsultationStatus,
  normalizeConsultationNote,
  toConsultationRequestView,
} from "./types";
export {
  createConsultationRequest,
  validateCreateConsultationRequestInput,
  CreateConsultationRequestError,
} from "./createConsultationRequest";
export type {
  CreateConsultationRequestInput,
  CreateConsultationRequestResult,
  CreateConsultationRequestErrorCode,
} from "./createConsultationRequest";
export {
  getConsultationRequests,
  getOpenConsultationRequestForStudent,
} from "./getConsultationRequests";
export {
  updateConsultationRequestStatus,
  validateUpdateConsultationStatusInput,
  UpdateConsultationStatusError,
} from "./updateConsultationRequestStatus";
export type {
  UpdateConsultationStatusInput,
  UpdateConsultationStatusErrorCode,
} from "./updateConsultationRequestStatus";
export {
  createConsultationRequestAction,
  updateConsultationRequestStatusAction,
} from "./actions";
export type {
  CreateConsultationActionState,
  CreateConsultationActionErrorCode,
  UpdateConsultationActionState,
  UpdateConsultationActionErrorCode,
} from "./actions";
export { ensureConsultationSchema } from "./schema";
