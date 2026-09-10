import type { SqlConnection } from "@/lib/db/mysql";
import {
  mapConsultationRow,
  SQL_REQUEST_SELECT,
  type ConsultationRequestRow,
} from "./mapRow";
import { ensureConsultationSchema, loadConsultationConnection } from "./schema";
import {
  canTransitionConsultationStatus,
  isConsultationStatus,
  type ConsultationRequest,
  type ConsultationStatus,
} from "./types";

export type UpdateConsultationStatusInput = {
  requestId: number;
  status: ConsultationStatus;
  handledBy: number;
};

export type UpdateConsultationStatusErrorCode =
  | "invalid_input"
  | "not_found"
  | "invalid_transition"
  | "db_error";

export class UpdateConsultationStatusError extends Error {
  constructor(
    message: string,
    public readonly code: UpdateConsultationStatusErrorCode,
  ) {
    super(message);
    this.name = "UpdateConsultationStatusError";
  }
}

type UpdateConsultationStatusDeps = {
  getConnection: () => Promise<SqlConnection>;
};

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function validateUpdateConsultationStatusInput(
  raw: unknown,
): UpdateConsultationStatusInput {
  if (typeof raw !== "object" || raw === null) {
    throw new UpdateConsultationStatusError(
      "Request payload must be an object.",
      "invalid_input",
    );
  }

  const { requestId, status, handledBy } = raw as Record<string, unknown>;
  if (!isPositiveInt(requestId) || !isPositiveInt(handledBy)) {
    throw new UpdateConsultationStatusError(
      "requestId and handledBy must be positive integers.",
      "invalid_input",
    );
  }
  if (!isConsultationStatus(status)) {
    throw new UpdateConsultationStatusError(
      "status must be pending, acknowledged, or closed.",
      "invalid_input",
    );
  }

  return { requestId, status, handledBy };
}

const SQL_FIND_BY_ID = `
  SELECT ${SQL_REQUEST_SELECT}
  FROM consultation_requests r
  INNER JOIN app_users u ON u.id = r.student_id
  WHERE r.id = ?
  LIMIT 1
  FOR UPDATE
`;

const SQL_ACKNOWLEDGE = `
  UPDATE consultation_requests
  SET status = 'acknowledged',
      acknowledged_at = COALESCE(acknowledged_at, CURRENT_TIMESTAMP),
      handled_by = ?
  WHERE id = ?
    AND status = 'pending'
`;

const SQL_CLOSE = `
  UPDATE consultation_requests
  SET status = 'closed',
      closed_at = COALESCE(closed_at, CURRENT_TIMESTAMP),
      handled_by = ?
  WHERE id = ?
    AND status IN ('pending', 'acknowledged')
`;

/**
 * Moves a request pending → acknowledged / closed, or acknowledged → closed.
 * `handledBy` must come from the trusted teacher/admin session.
 */
export async function updateConsultationRequestStatus(
  rawInput: unknown,
  deps: UpdateConsultationStatusDeps = {
    getConnection: loadConsultationConnection,
  },
): Promise<ConsultationRequest> {
  const input = validateUpdateConsultationStatusInput(rawInput);
  await ensureConsultationSchema(deps.getConnection);

  try {
    const connection = await deps.getConnection();
    try {
      await connection.beginTransaction();

      const existingRows = await connection.query<ConsultationRequestRow>(
        SQL_FIND_BY_ID,
        [input.requestId],
      );
      const current = existingRows[0]
        ? mapConsultationRow(existingRows[0])
        : null;
      if (!current) {
        throw new UpdateConsultationStatusError(
          "Consultation request not found.",
          "not_found",
        );
      }

      if (
        !canTransitionConsultationStatus(current.status, input.status)
      ) {
        throw new UpdateConsultationStatusError(
          "This status transition is not allowed.",
          "invalid_transition",
        );
      }

      const sql = input.status === "acknowledged" ? SQL_ACKNOWLEDGE : SQL_CLOSE;
      const updated = await connection.execute(sql, [
        input.handledBy,
        input.requestId,
      ]);
      if (updated.affectedRows !== 1) {
        throw new UpdateConsultationStatusError(
          "Failed to update the consultation request.",
          "db_error",
        );
      }

      const nextRows = await connection.query<ConsultationRequestRow>(
        SQL_FIND_BY_ID,
        [input.requestId],
      );
      const next = nextRows[0] ? mapConsultationRow(nextRows[0]) : null;
      if (!next) {
        throw new UpdateConsultationStatusError(
          "Failed to load the updated consultation request.",
          "db_error",
        );
      }

      await connection.commit();
      return next;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    if (error instanceof UpdateConsultationStatusError) {
      throw error;
    }
    console.error(
      "updateConsultationRequestStatus: unexpected database error",
      error,
    );
    throw new UpdateConsultationStatusError(
      "Database operation failed.",
      "db_error",
    );
  }
}
