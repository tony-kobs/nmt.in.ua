import assert from "node:assert/strict";
import { test } from "node:test";
import { handleNotificationTrigger } from "./notificationTrigger";
import { POST, runtime, maxDuration } from "../../app/api/telegram/notifications/process/route";

test("trigger fails closed, delegates once, preserves counts and hides failures", async () => {
  const previous = process.env.TELEGRAM_NOTIFICATIONS_TRIGGER_SECRET;
  const counts = { sent: 1, skipped: 2, failed: 0, rejected: 0, uncertain: 0 };
  let calls = 0;
  const processor = async () => { calls++; return counts; };
  const request = (header?: string) => new Request("https://example.test/api/telegram/notifications/process", {
    method: "POST", headers: header ? { authorization: header } : {},
  });
  try {
    assert.equal(runtime, "nodejs");
    assert.equal(maxDuration, 60);
    for (const secret of [undefined, "", "   "]) {
      if (secret === undefined) delete process.env.TELEGRAM_NOTIFICATIONS_TRIGGER_SECRET;
      else process.env.TELEGRAM_NOTIFICATIONS_TRIGGER_SECRET = secret;
      assert.equal((await handleNotificationTrigger(request("Bearer test-secret"), processor)).status, 401);
    }
    process.env.TELEGRAM_NOTIFICATIONS_TRIGGER_SECRET = "test-secret";
    for (const header of [undefined, "Bearer ", "Basic test-secret", "Bearer wrong", "Bearer test-secret-extra"]) {
      assert.equal((await handleNotificationTrigger(request(header), processor)).status, 401);
    }
    assert.equal(calls, 0);
    assert.equal((await POST(request())).status, 401);
    const response = await handleNotificationTrigger(request("Bearer test-secret"), processor);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.deepEqual(await response.json(), counts);
    assert.equal(calls, 1);
    const repeated = await handleNotificationTrigger(request("Bearer test-secret"), async () => {
      calls++;
      return { ...counts, sent: 0, skipped: 3 };
    });
    assert.equal((await repeated.json()).skipped, 3);
    assert.equal(calls, 2);
    const partial = await handleNotificationTrigger(request("Bearer test-secret"), async () => ({
      sent: 0, skipped: 0, failed: 1, rejected: 2, uncertain: 3,
    }));
    assert.deepEqual(await partial.json(), { sent: 0, skipped: 0, failed: 1, rejected: 2, uncertain: 3 });
    const failure = await handleNotificationTrigger(request("Bearer test-secret"), async () => {
      throw new Error("private database secret");
    });
    assert.equal(failure.status, 500);
    assert.equal(await failure.text(), "");
  } finally {
    if (previous === undefined) delete process.env.TELEGRAM_NOTIFICATIONS_TRIGGER_SECRET;
    else process.env.TELEGRAM_NOTIFICATIONS_TRIGGER_SECRET = previous;
  }
});

test("trigger validates and forwards continuation cursors while preserving partial results", async () => {
  const previous = process.env.TELEGRAM_NOTIFICATIONS_TRIGGER_SECRET;
  process.env.TELEGRAM_NOTIFICATIONS_TRIGGER_SECRET = "cursor-secret";
  try {
    const request = (cursor: string) => new Request("https://example.test/api/telegram/notifications/process?afterAccountId=" + cursor,
      { method: "POST", headers: { authorization: "Bearer cursor-secret" } });
    for (const cursor of ["-1", "1.5", "NaN", "9007199254740992", "01", ""]) {
      assert.equal((await handleNotificationTrigger(request(cursor), async () => assert.fail("invalid cursor"))).status, 400);
    }
    const partial = { sent: 1, skipped: 0, failed: 0, rejected: 0, uncertain: 0, processedAccounts: 0, complete: false, nextCursor: 25 };
    const response = await handleNotificationTrigger(request("25"), async (_deps, batch) => {
      assert.deepEqual(batch, { afterAccountId: 25 });
      return partial;
    });
    assert.deepEqual(await response.json(), partial);
  } finally {
    if (previous === undefined) delete process.env.TELEGRAM_NOTIFICATIONS_TRIGGER_SECRET;
    else process.env.TELEGRAM_NOTIFICATIONS_TRIGGER_SECRET = previous;
  }
});
