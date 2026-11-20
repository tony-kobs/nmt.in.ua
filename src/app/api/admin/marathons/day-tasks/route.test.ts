import assert from "node:assert/strict";
import test from "node:test";
import { dayTaskApiResponse } from "@/modules/marathons/daily/dayTaskApi";

test("the day-task API refuses a caller without marathon:manage", () => {
  const response = dayTaskApiResponse(false, {
    action: "validate",
    prompt: "Скільки буде 2+2?",
    options: ["3", "4"],
    correct: 2,
  });
  assert.equal(response.status, 401);
});

test("the day-task API validates an inline copy and rejects a bad key", () => {
  const ok = dayTaskApiResponse(true, {
    action: "validate",
    prompt: "Скільки буде 2+2?",
    options: ["3", "4"],
    correct: 2,
    explanation: "",
  });
  assert.equal(ok.status, 200);
  const bad = dayTaskApiResponse(true, {
    action: "validate",
    prompt: "Скільки буде 2+2?",
    options: ["4", "4"],
    correct: 1,
  });
  assert.equal(bad.status, 400);
  const plan = dayTaskApiResponse(true, { action: "plan", ids: [5, 8], here: [5] });
  assert.equal(plan.status, 200);
  assert.deepEqual((plan.json as { add: number[] }).add, [8]);
});
