import assert from "node:assert/strict";
import test from "node:test";
import type { SqlConnection } from "@/lib/db/mysql";
import type { ConsultationRequestRow } from "./mapRow";
import {
  updateConsultationRequestStatus,
  UpdateConsultationStatusError,
  validateUpdateConsultationStatusInput,
} from "./updateConsultationRequestStatus";

function row(
  overrides: Partial<ConsultationRequestRow> = {},
): ConsultationRequestRow {
  return {
    id: 4,
    student_id: 1,
    note: "Алгебра",
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
  current?: ConsultationRequestRow | null;
  next?: ConsultationRequestRow | null;
  affectedRows?: number;
}) {
  const calls: Array<{ sql: string; params?: unknown[] }> = [];
  let findCount = 0;
  const connection: SqlConnection = {
    beginTransaction: async () => {},
    query: async <T,>() => {
      findCount += 1;
      const payload = findCount === 1 ? options.current : options.next;
      return (payload ? [payload] : []) as T[];
    },
    execute: async (sql, params = []) => {
      calls.push({ sql, params });
      if (sql.includes("CREATE TABLE")) {
        return { insertId: 0, affectedRows: 0 };
      }
      return { insertId: 0, affectedRows: options.affectedRows ?? 1 };
    },
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  };
  return { connection, calls };
}

test("validateUpdateConsultationStatusInput requires ids and a known status", () => {
  assert.deepEqual(
    validateUpdateConsultationStatusInput({
      requestId: 4,
      status: "closed",
      handledBy: 2,
    }),
    { requestId: 4, status: "closed", handledBy: 2 },
  );

  assert.throws(
    () =>
      validateUpdateConsultationStatusInput({
        requestId: 4,
        status: "open",
        handledBy: 2,
      }),
    (error: unknown) =>
      error instanceof UpdateConsultationStatusError &&
      error.code === "invalid_input",
  );
});

test("updateConsultationRequestStatus acknowledges a pending request", async () => {
  const current = row();
  const next = row({
    status: "acknowledged",
    handled_by: 2,
    acknowledged_at: new Date("2026-09-10T11:00:00.000Z"),
  });
  const mock = makeConnection({ current, next });

  const result = await updateConsultationRequestStatus(
    { requestId: 4, status: "acknowledged", handledBy: 2 },
    { getConnection: async () => mock.connection },
  );

  assert.equal(result.status, "acknowledged");
  assert.equal(result.handledBy, 2);
  const update = mock.calls.find((call) =>
    call.sql.includes("status = 'acknowledged'"),
  );
  assert.ok(update);
  assert.deepEqual(update!.params, [2, 4]);
});

test("updateConsultationRequestStatus rejects closing an already closed request", async () => {
  const mock = makeConnection({ current: row({ status: "closed" }) });

  await assert.rejects(
    () =>
      updateConsultationRequestStatus(
        { requestId: 4, status: "closed", handledBy: 2 },
        { getConnection: async () => mock.connection },
      ),
    (error: unknown) =>
      error instanceof UpdateConsultationStatusError &&
      error.code === "invalid_transition",
  );
});

test("updateConsultationRequestStatus reports a missing row", async () => {
  const mock = makeConnection({ current: null });

  await assert.rejects(
    () =>
      updateConsultationRequestStatus(
        { requestId: 99, status: "closed", handledBy: 2 },
        { getConnection: async () => mock.connection },
      ),
    (error: unknown) =>
      error instanceof UpdateConsultationStatusError &&
      error.code === "not_found",
  );
});
