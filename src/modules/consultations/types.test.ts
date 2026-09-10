import assert from "node:assert/strict";
import test from "node:test";
import {
  canTransitionConsultationStatus,
  isConsultationStatus,
  isOpenConsultationStatus,
  normalizeConsultationNote,
  toConsultationRequestView,
  type ConsultationRequest,
} from "./types";

test("isConsultationStatus accepts only the three stored values", () => {
  assert.equal(isConsultationStatus("pending"), true);
  assert.equal(isConsultationStatus("acknowledged"), true);
  assert.equal(isConsultationStatus("closed"), true);
  assert.equal(isConsultationStatus("open"), false);
  assert.equal(isConsultationStatus(""), false);
});

test("isOpenConsultationStatus treats pending and acknowledged as open", () => {
  assert.equal(isOpenConsultationStatus("pending"), true);
  assert.equal(isOpenConsultationStatus("acknowledged"), true);
  assert.equal(isOpenConsultationStatus("closed"), false);
});

test("canTransitionConsultationStatus allows pending → acknowledged/closed and acknowledged → closed", () => {
  assert.equal(canTransitionConsultationStatus("pending", "acknowledged"), true);
  assert.equal(canTransitionConsultationStatus("pending", "closed"), true);
  assert.equal(
    canTransitionConsultationStatus("acknowledged", "closed"),
    true,
  );
  assert.equal(
    canTransitionConsultationStatus("acknowledged", "pending"),
    false,
  );
  assert.equal(canTransitionConsultationStatus("closed", "pending"), false);
  assert.equal(
    canTransitionConsultationStatus("closed", "acknowledged"),
    false,
  );
  assert.equal(canTransitionConsultationStatus("pending", "pending"), false);
});

test("normalizeConsultationNote trims and treats blank as empty", () => {
  assert.equal(normalizeConsultationNote("  потрібна допомога  "), "потрібна допомога");
  assert.equal(normalizeConsultationNote("   "), null);
  assert.equal(normalizeConsultationNote(""), null);
  assert.equal(normalizeConsultationNote(null), null);
  assert.equal(normalizeConsultationNote(12), null);
});

test("toConsultationRequestView serializes createdAt to ISO", () => {
  const createdAt = new Date("2026-09-10T12:00:00.000Z");
  const row: ConsultationRequest = {
    id: 4,
    studentId: 1,
    studentDisplayName: "Олена Коваленко",
    studentLogin: "demo-student",
    note: "Алгебра",
    status: "pending",
    createdAt,
    updatedAt: createdAt,
    acknowledgedAt: null,
    closedAt: null,
    handledBy: null,
  };

  assert.deepEqual(toConsultationRequestView(row), {
    id: 4,
    studentId: 1,
    studentDisplayName: "Олена Коваленко",
    studentLogin: "demo-student",
    note: "Алгебра",
    status: "pending",
    createdAt: "2026-09-10T12:00:00.000Z",
  });
});
