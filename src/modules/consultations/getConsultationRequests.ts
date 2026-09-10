import type { SqlConnection } from "@/lib/db/mysql";
import {
  mapConsultationRow,
  SQL_REQUEST_SELECT,
  type ConsultationRequestRow,
} from "./mapRow";
import { ensureConsultationSchema, loadConsultationConnection } from "./schema";
import {
  CONSULTATION_LIST_LIMIT,
  type ConsultationRequest,
} from "./types";

type GetConsultationRequestsDeps = {
  getConnection: () => Promise<SqlConnection>;
};

const SQL_LIST = `
  SELECT ${SQL_REQUEST_SELECT}
  FROM consultation_requests r
  INNER JOIN app_users u ON u.id = r.student_id
  ORDER BY
    FIELD(r.status, 'pending', 'acknowledged', 'closed'),
    r.id DESC
  LIMIT ${CONSULTATION_LIST_LIMIT}
`;

const SQL_OPEN_FOR_STUDENT = `
  SELECT ${SQL_REQUEST_SELECT}
  FROM consultation_requests r
  INNER JOIN app_users u ON u.id = r.student_id
  WHERE r.student_id = ?
    AND r.status IN ('pending', 'acknowledged')
  ORDER BY r.id DESC
  LIMIT 1
`;

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

/** Newest consultation requests for teachers/admins. Open rows first. */
export async function getConsultationRequests(
  deps: GetConsultationRequestsDeps = {
    getConnection: loadConsultationConnection,
  },
): Promise<ConsultationRequest[]> {
  await ensureConsultationSchema(deps.getConnection);
  const connection = await deps.getConnection();
  try {
    const rows = await connection.query<ConsultationRequestRow>(SQL_LIST);
    return rows
      .map(mapConsultationRow)
      .filter((row): row is ConsultationRequest => row !== null);
  } finally {
    connection.release();
  }
}

/** The student's current open request, if any. */
export async function getOpenConsultationRequestForStudent(
  studentId: number,
  deps: GetConsultationRequestsDeps = {
    getConnection: loadConsultationConnection,
  },
): Promise<ConsultationRequest | null> {
  if (!isPositiveInt(studentId)) return null;

  await ensureConsultationSchema(deps.getConnection);
  const connection = await deps.getConnection();
  try {
    const rows = await connection.query<ConsultationRequestRow>(
      SQL_OPEN_FOR_STUDENT,
      [studentId],
    );
    return rows[0] ? mapConsultationRow(rows[0]) : null;
  } finally {
    connection.release();
  }
}
