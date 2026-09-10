import assert from "node:assert/strict";
import test from "node:test";
import type { AuthUser } from "@/modules/auth/types";
import {
  createConsultationRequestAction,
  updateConsultationRequestStatusAction,
} from "./actions";
import { createConsultationRequest } from "./createConsultationRequest";
import { updateConsultationRequestStatus } from "./updateConsultationRequestStatus";
import type { ConsultationRequest } from "./types";

const student: AuthUser = {
  id: 1,
  login: "demo-student",
  displayName: "Олена",
  role: "student",
};

const teacher: AuthUser = {
  id: 2,
  login: "demo-teacher",
  displayName: "Ігор",
  role: "teacher",
};

const request: ConsultationRequest = {
  id: 8,
  studentId: 1,
  studentDisplayName: "Олена",
  studentLogin: "demo-student",
  note: "Функції",
  status: "pending",
  createdAt: new Date("2026-09-10T12:00:00.000Z"),
  updatedAt: new Date("2026-09-10T12:00:00.000Z"),
  acknowledgedAt: null,
  closedAt: null,
  handledBy: null,
};

test("createConsultationRequestAction uses the session student and ignores a spoofed id", async () => {
  let captured: unknown;
  const spy = (async (input: unknown) => {
    captured = input;
    return { created: true, request };
  }) as typeof createConsultationRequest;

  const form = new FormData();
  form.set("note", "Функції");
  form.set("studentId", "999");

  const state = await createConsultationRequestAction(
    { status: "idle" },
    form,
    {
      requireUser: async () => student,
      createConsultationRequest: spy,
      revalidatePath: () => {},
    },
  );

  assert.equal(state.status, "success");
  if (state.status === "success") {
    assert.equal(state.created, true);
    assert.equal(state.request.id, 8);
  }
  assert.deepEqual(captured, { studentId: 1, note: "Функції" });
});

test("createConsultationRequestAction forbids teachers from creating a request", async () => {
  let called = false;
  const spy = (async () => {
    called = true;
    return { created: true, request };
  }) as typeof createConsultationRequest;

  const state = await createConsultationRequestAction(
    { status: "idle" },
    new FormData(),
    {
      requireUser: async () => teacher,
      createConsultationRequest: spy,
      revalidatePath: () => {},
    },
  );

  assert.deepEqual(state, { status: "error", code: "forbidden" });
  assert.equal(called, false);
});

test("updateConsultationRequestStatusAction takes handler id from the session", async () => {
  let captured: unknown;
  const spy = (async (input: unknown) => {
    captured = input;
    return { ...request, status: "closed" as const, handledBy: 2 };
  }) as typeof updateConsultationRequestStatus;

  const form = new FormData();
  form.set("requestId", "8");
  form.set("status", "closed");
  form.set("handledBy", "999");

  const state = await updateConsultationRequestStatusAction(
    { status: "idle" },
    form,
    {
      requireRole: async () => teacher,
      updateConsultationRequestStatus: spy,
      revalidatePath: () => {},
    },
  );

  assert.equal(state.status, "success");
  assert.deepEqual(captured, {
    requestId: 8,
    status: "closed",
    handledBy: 2,
  });
});
