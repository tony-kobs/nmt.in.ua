import type { ConsultationRequest } from "./types";
import { isConsultationStatus } from "./types";

export type ConsultationRequestRow = {
  id: number;
  student_id: number;
  note: string | null;
  status: string;
  created_at: Date | string;
  updated_at: Date | string;
  acknowledged_at: Date | string | null;
  closed_at: Date | string | null;
  handled_by: number | null;
  display_name: string | null;
  login: string | null;
};

export function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export function toOptionalDate(
  value: Date | string | null,
): Date | null {
  if (value == null) return null;
  return toDate(value);
}

export const SQL_REQUEST_SELECT = `
  r.id,
  r.student_id,
  r.note,
  r.status,
  r.created_at,
  r.updated_at,
  r.acknowledged_at,
  r.closed_at,
  r.handled_by,
  u.display_name,
  u.login
`;

export function mapConsultationRow(
  row: ConsultationRequestRow,
): ConsultationRequest | null {
  if (!isConsultationStatus(row.status)) return null;
  const displayName = row.display_name?.trim() || "";
  const login = row.login?.trim() || "";
  if (!displayName || !login) return null;

  return {
    id: row.id,
    studentId: row.student_id,
    studentDisplayName: displayName,
    studentLogin: login,
    note: row.note?.trim() || null,
    status: row.status,
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
    acknowledgedAt: toOptionalDate(row.acknowledged_at),
    closedAt: toOptionalDate(row.closed_at),
    handledBy: row.handled_by,
  };
}
