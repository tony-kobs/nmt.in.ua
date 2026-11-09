import assert from "node:assert/strict";
import test from "node:test";

import {
  enqueueMarathonTelegram,
  findArchivedMarathonByChat,
  findParticipantByChat,
  listChatMarathons,
  marathonCallbackFromStoredLabel,
  markDayTestStarted,
  noteMarathonTelegram,
  quizTaskExists,
  recordMaterialsDelivered,
  rememberMarathonButtonLabels,
  searchQuizTasks,
  selectChatMarathon,
} from "../store";

test("store guards return before a query when the input cannot match a row", async () => {
  assert.equal(await quizTaskExists(0), false);
  assert.equal(await quizTaskExists(1.5), false);
  assert.deepEqual(await searchQuizTasks("   "), []);
  assert.equal(await findParticipantByChat("0123"), null);
  assert.equal(await findArchivedMarathonByChat("abc"), null);
  assert.deepEqual(await listChatMarathons(""), []);
  assert.equal(await selectChatMarathon("12", 0), false);
  assert.equal(await marathonCallbackFromStoredLabel(3, "  "), null);
  await rememberMarathonButtonLabels(3, []);
  await enqueueMarathonTelegram([]);
  await noteMarathonTelegram(4, {});
  await markDayTestStarted({ marathonId: 1.2, userId: 1, dayId: 1, now: new Date() });
  await recordMaterialsDelivered(1, 1, Number.NaN, new Date());
});
