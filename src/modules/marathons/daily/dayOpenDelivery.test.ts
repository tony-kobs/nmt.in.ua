import assert from "node:assert/strict";
import test from "node:test";

import { dayOpenDeliveryOk } from "./notificationsJob";

test("day_open is confirmed only after a successful enqueue", () => {
  assert.equal(dayOpenDeliveryOk("sent", true), true);
  assert.equal(dayOpenDeliveryOk("sent", false), false);
  assert.equal(dayOpenDeliveryOk("retry", true), false);
  assert.equal(dayOpenDeliveryOk("retry", false), false);
  assert.equal(dayOpenDeliveryOk("definitive", false), true);
});
