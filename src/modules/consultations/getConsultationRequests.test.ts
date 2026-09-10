import assert from "node:assert/strict";
import test from "node:test";
import type { SqlConnection } from "@/lib/db/mysql";
import {
  getConsultationRequests,
  getOpenConsultationRequestForStudent,
} from "./getConsultationRequests";
import type { ConsultationRequestRow } from "./mapRow";

function row(
  overrides: Partial<ConsultationRequestRow> = {},
): ConsultationRequestRow {
  return {
    id: 3,
    student_id: 1,
    note: null,
    status: "pending",
    created_at: "2026-09-10T09:00:00.000Z",
    updated_at: "2026-09-10T09:00:00.000Z",
    acknowledged_at: null,
    closed_at: null,
    handled_by: null,
    display_name: "Олена Коваленко",
    login: "demo-student",
    ...overrides,
  };
}

function makeConnection(rows: ConsultationRequestRow[]) {
  const connection: SqlConnection = {
    beginTransaction: async () => {},
    query: async <T,>() => rows as T[],
    execute: async () => ({ insertId: 0, affectedRows: 0 }),
    commit: async () => {},
    rollback: async () => {},
    release: () => {},
  };
  return connection;
}

test("getConsultationRequests maps joined student fields and skips a broken status", async () => {
  const rows = await getConsultationRequests({
    getConnection: async () =>
      makeConnection([
        row(),
        row({ id: 4, status: "nope", display_name: "X", login: "x" }),
      ]),
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.studentDisplayName, "Олена Коваленко");
  assert.equal(rows[0]!.studentLogin, "demo-student");
  assert.ok(rows[0]!.createdAt instanceof Date);
});

test("getOpenConsultationRequestForStudent returns null without a positive id", async () => {
  const result = await getOpenConsultationRequestForStudent(0, {
    getConnection: async () => makeConnection([row()]),
  });
  assert.equal(result, null);
});
