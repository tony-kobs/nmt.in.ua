import assert from "node:assert/strict";
import test from "node:test";
import type { SqlConnection } from "@/lib/db/mysql";
import {
  createConsultationRequest,
  CreateConsultationRequestError,
  validateCreateConsultationRequestInput,
} from "./createConsultationRequest";
import type { ConsultationRequestRow } from "./mapRow";

function openRow(
  overrides: Partial<ConsultationRequestRow> = {},
): ConsultationRequestRow {
  return {
    id: 9,
    student_id: 1,
    note: "Геометрія",
    status: "pending",
    created_at: new Date("2026-09-10T10:00:00.000Z"),
    updated_at: new Date("2026-09-10T10:00:00.000Z"),
    acknowledged_at: null,
    closed_at: null,
    handled_by: null,
    display_name: "Олена Коваленко",
    login: "demo-student",
    ...overrides,
  };
}

function makeConnection(options: {
  existing?: ConsultationRequestRow | null;
  insertId?: number;
  created?: ConsultationRequestRow | null;
  failInsert?: boolean;
} = {}) {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  const connection: SqlConnection = {
    beginTransaction: async () => {},
    query: async <T,>(sql: string) => {
      calls.push({ sql });
      if (sql.includes("status IN ('pending', 'acknowledged')")) {
        return (options.existing ? [options.existing] : []) as T[];
      }
      if (sql.includes("WHERE r.id = ?")) {
        return (options.created ? [options.created] : []) as T[];
      }
      return [] as T[];
    },
    execute: async (sql, params = []) => {
      calls.push({ sql, params });
      if (sql.includes("CREATE TABLE")) {
        return { insertId: 0, affectedRows: 0 };
      }
      if (sql.includes("INSERT INTO consultation_requests")) {
        return {
          insertId: options.insertId ?? 21,
          affectedRows: options.failInsert ? 0 : 1,
        };
      }
      return { insertId: 0, affectedRows: 0 };
    },
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  };
  return { connection, calls };
}

test("validateCreateConsultationRequestInput trims note and rejects a missing student", () => {
  assert.deepEqual(
    validateCreateConsultationRequestInput({
      studentId: 3,
      note: "  логарифми  ",
    }),
    { studentId: 3, note: "логарифми" },
  );

  assert.throws(
    () => validateCreateConsultationRequestInput({ studentId: 0, note: "" }),
    (error: unknown) =>
      error instanceof CreateConsultationRequestError &&
      error.code === "invalid_input",
  );
});

test("validateCreateConsultationRequestInput rejects a note over the limit", () => {
  assert.throws(
    () =>
      validateCreateConsultationRequestInput({
        studentId: 1,
        note: "x".repeat(1001),
      }),
    (error: unknown) =>
      error instanceof CreateConsultationRequestError &&
      error.code === "invalid_input",
  );
});

test("createConsultationRequest inserts a pending row when none is open", async () => {
  const created = openRow({
    id: 21,
    note: "Потрібна допомога з функціями",
  });
  const mock = makeConnection({ insertId: 21, created });

  const result = await createConsultationRequest(
    { studentId: 1, note: "  Потрібна допомога з функціями  " },
    { getConnection: async () => mock.connection },
  );

  assert.equal(result.created, true);
  assert.equal(result.request.id, 21);
  assert.equal(result.request.note, "Потрібна допомога з функціями");
  const insert = mock.calls.find((call) =>
    call.sql.includes("INSERT INTO consultation_requests"),
  );
  assert.ok(insert);
  assert.deepEqual(insert!.params, [1, "Потрібна допомога з функціями"]);
});

test("createConsultationRequest returns the existing open request without a second insert", async () => {
  const existing = openRow();
  const mock = makeConnection({ existing });

  const result = await createConsultationRequest(
    { studentId: 1, note: "ще один" },
    { getConnection: async () => mock.connection },
  );

  assert.equal(result.created, false);
  assert.equal(result.request.id, 9);
  assert.equal(
    mock.calls.some((call) =>
      call.sql.includes("INSERT INTO consultation_requests"),
    ),
    false,
  );
});
