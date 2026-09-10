export const CONSULTATION_STATUSES = [
  "pending",
  "acknowledged",
  "closed",
] as const;

export type ConsultationStatus = (typeof CONSULTATION_STATUSES)[number];

export const OPEN_CONSULTATION_STATUSES = ["pending", "acknowledged"] as const;

export type OpenConsultationStatus = (typeof OPEN_CONSULTATION_STATUSES)[number];

export const NOTE_MAX_LEN = 1000;
export const CONSULTATION_LIST_LIMIT = 50;

export type ConsultationRequest = {
  id: number;
  studentId: number;
  studentDisplayName: string;
  studentLogin: string;
  note: string | null;
  status: ConsultationStatus;
  createdAt: Date;
  updatedAt: Date;
  acknowledgedAt: Date | null;
  closedAt: Date | null;
  handledBy: number | null;
};

/** JSON-safe view for client components. */
export type ConsultationRequestView = {
  id: number;
  studentId: number;
  studentDisplayName: string;
  studentLogin: string;
  note: string | null;
  status: ConsultationStatus;
  createdAt: string;
};

export function isConsultationStatus(
  value: unknown,
): value is ConsultationStatus {
  return (
    value === "pending" || value === "acknowledged" || value === "closed"
  );
}

export function isOpenConsultationStatus(
  value: unknown,
): value is OpenConsultationStatus {
  return value === "pending" || value === "acknowledged";
}

export function canTransitionConsultationStatus(
  from: ConsultationStatus,
  to: ConsultationStatus,
): boolean {
  if (from === to) return false;
  if (from === "closed") return false;
  if (to === "pending") return false;
  if (from === "pending") return to === "acknowledged" || to === "closed";
  return from === "acknowledged" && to === "closed";
}

export function normalizeConsultationNote(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

export function toConsultationRequestView(
  row: ConsultationRequest,
): ConsultationRequestView {
  return {
    id: row.id,
    studentId: row.studentId,
    studentDisplayName: row.studentDisplayName,
    studentLogin: row.studentLogin,
    note: row.note,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}
