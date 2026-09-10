import type { SqlConnection } from "@/lib/db/mysql";
import {
  mapConsultationRow,
  SQL_REQUEST_SELECT,
  type ConsultationRequestRow,
} from "./mapRow";
import { ensureConsultationSchema, loadConsultationConnection } from "./schema";
import {
  NOTE_MAX_LEN,
  normalizeConsultationNote,
  type ConsultationRequest,
} from "./types";

export type CreateConsultationRequestInput = {
  studentId: number;
  note: string | null;
};

export type CreateConsultationRequestResult = {
  created: boolean;
  request: ConsultationRequest;
};

export type CreateConsultationRequestErrorCode =
  | "invalid_input"
  | "forbidden"
  | "db_error";

export class CreateConsultationRequestError extends Error {
  constructor(
    message: string,
    public readonly code: CreateConsultationRequestErrorCode,
  ) {
    super(message);
    this.name = "CreateConsultationRequestError";
  }
}

type CreateConsultationRequestDeps = {
  getConnection: () => Promise<SqlConnection>;
};

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

export function validateCreateConsultationRequestInput(
  raw: unknown,
): CreateConsultationRequestInput {
  if (typeof raw !== "object" || raw === null) {
    throw new CreateConsultationRequestError(
      "Request payload must be an object.",
      "invalid_input",
    );
  }

  const { studentId, note } = raw as Record<string, unknown>;
  if (!isPositiveInt(studentId)) {
    throw new CreateConsultationRequestError(
      "studentId must be a positive integer.",
      "invalid_input",
    );
  }

  const normalizedNote = normalizeConsultationNote(note);
  if (normalizedNote && normalizedNote.length > NOTE_MAX_LEN) {
    throw new CreateConsultationRequestError(
      "note is too long.",
      "invalid_input",
    );
  }

  return { studentId, note: normalizedNote };
}

const SQL_FIND_OPEN = `
  SELECT ${SQL_REQUEST_SELECT}
  FROM consultation_requests r
  INNER JOIN app_users u ON u.id = r.student_id
  WHERE r.student_id = ?
    AND r.status IN ('pending', 'acknowledged')
  ORDER BY r.id DESC
  LIMIT 1
  FOR UPDATE
`;

const SQL_INSERT = `
  INSERT INTO consultation_requests (student_id, note, status)
  VALUES (?, ?, 'pending')
`;

const SQL_FIND_BY_ID = `
  SELECT ${SQL_REQUEST_SELECT}
  FROM consultation_requests r
  INNER JOIN app_users u ON u.id = r.student_id
  WHERE r.id = ?
  LIMIT 1
`;

/**
 * Inserts a pending consultation request. If the student already has an
 * open (pending/acknowledged) request, returns that row instead.
 * `studentId` must come from the trusted session.
 */
export async function createConsultationRequest(
  rawInput: unknown,
  deps: CreateConsultationRequestDeps = {
    getConnection: loadConsultationConnection,
  },
): Promise<CreateConsultationRequestResult> {
  const input = validateCreateConsultationRequestInput(rawInput);
  await ensureConsultationSchema(deps.getConnection);

  try {
    const connection = await deps.getConnection();
    try {
      await connection.beginTransaction();

      const existing = await connection.query<ConsultationRequestRow>(
        SQL_FIND_OPEN,
        [input.studentId],
      );
      const open = existing[0] ? mapConsultationRow(existing[0]) : null;
      if (open) {
        await connection.commit();
        return { created: false, request: open };
      }

      const inserted = await connection.execute(SQL_INSERT, [
        input.studentId,
        input.note,
      ]);
      if (inserted.insertId <= 0 || inserted.affectedRows !== 1) {
        throw new CreateConsultationRequestError(
          "Failed to store the consultation request.",
          "db_error",
        );
      }

      const createdRows = await connection.query<ConsultationRequestRow>(
        SQL_FIND_BY_ID,
        [inserted.insertId],
      );
      const created = createdRows[0]
        ? mapConsultationRow(createdRows[0])
        : null;
      if (!created) {
        throw new CreateConsultationRequestError(
          "Failed to load the created consultation request.",
          "db_error",
        );
      }

      await connection.commit();
      return { created: true, request: created };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    if (error instanceof CreateConsultationRequestError) {
      throw error;
    }
    console.error(
      "createConsultationRequest: unexpected database error",
      error,
    );
    throw new CreateConsultationRequestError(
      "Database operation failed.",
      "db_error",
    );
  }
}
