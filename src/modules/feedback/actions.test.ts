import assert from "node:assert/strict";
import test from "node:test";
import type { AuthUser } from "@/modules/auth/types";
import { submitFeedbackAction } from "./actions";
import { submitFeedback, SubmitFeedbackError } from "./submitFeedback";

const student: AuthUser = {
  id: 1,
  login: "demo-student",
  displayName: "Олена",
  role: "student",
};

test("submitFeedbackAction uses the session user and ignores client email", async () => {
  let captured: unknown;
  const spy = (async (input: unknown) => {
    captured = input;
    return { id: 1 };
  }) as typeof submitFeedback;

  const state = await submitFeedbackAction(
    {
      score: 5,
      message: "ok",
      email: "spoof@example.com",
      source: "footer",
    },
    {
      getCurrentUser: async () => student,
      submitFeedback: spy,
    },
  );

  assert.deepEqual(state, { status: "success" });
  assert.deepEqual(captured, {
    userId: 1,
    sessionId: null,
    score: 5,
    message: "ok",
    email: null,
    source: "footer",
  });
});

test("submitFeedbackAction stores a guest with optional email", async () => {
  let captured: unknown;
  const spy = (async (input: unknown) => {
    captured = input;
    return { id: 2 };
  }) as typeof submitFeedback;

  const state = await submitFeedbackAction(
    {
      score: 2,
      message: "Повільно",
      email: "guest@example.com",
      source: "footer",
    },
    {
      getCurrentUser: async () => null,
      submitFeedback: spy,
    },
  );

  assert.deepEqual(state, { status: "success" });
  assert.deepEqual(captured, {
    userId: null,
    sessionId: null,
    score: 2,
    message: "Повільно",
    email: "guest@example.com",
    source: "footer",
  });
});

test("submitFeedbackAction keeps sessionId only for post_test", async () => {
  let captured: unknown;
  const spy = (async (input: unknown) => {
    captured = input;
    return { id: 3 };
  }) as typeof submitFeedback;

  await submitFeedbackAction(
    {
      score: 4,
      message: "",
      source: "post_test",
      sessionId: 38,
    },
    {
      getCurrentUser: async () => student,
      submitFeedback: spy,
    },
  );

  assert.equal(
    (captured as { sessionId: number | null }).sessionId,
    38,
  );
});

test("submitFeedbackAction maps message_required for the client", async () => {
  const spy = (async () => {
    throw new SubmitFeedbackError("hidden", "message_required");
  }) as typeof submitFeedback;

  const state = await submitFeedbackAction(
    { score: 1, message: "", source: "footer" },
    {
      getCurrentUser: async () => null,
      submitFeedback: spy,
    },
  );

  assert.deepEqual(state, { status: "error", code: "message_required" });
});
