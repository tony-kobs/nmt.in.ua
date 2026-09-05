import assert from "node:assert/strict";
import test from "node:test";
import {
  appendFeedbackPrompt,
  parseFeedbackPromptLog,
  wasFeedbackPrompted,
} from "./promptLog";

test("wasFeedbackPrompted is false until this session id is stored", () => {
  assert.equal(wasFeedbackPrompted(null, 38), false);
  const stored = appendFeedbackPrompt(null, 38, 1_700_000_000);
  assert.equal(wasFeedbackPrompted(stored, 38), true);
  assert.equal(wasFeedbackPrompted(stored, 39), false);
});

test("parseFeedbackPromptLog accepts a single { sessionId, at } record", () => {
  const raw = JSON.stringify({ sessionId: 12, at: 99 });
  assert.deepEqual(parseFeedbackPromptLog(raw), { "12": 99 });
});
