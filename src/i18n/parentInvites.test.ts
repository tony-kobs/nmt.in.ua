import assert from "node:assert/strict";
import test from "node:test";
import uk from "../../messages/uk.json";
import en from "../../messages/en.json";
import de from "../../messages/de.json";
import { pickClientMessages } from "./clientMessages";

test("both cabinet locations receive all invitation translations and safe error codes", () => {
  for (const messages of [uk, en, de]) {
    assert.deepEqual(Object.keys(messages.ParentInvites).sort(), Object.keys(uk.ParentInvites).sort());
    assert.deepEqual(Object.keys(messages.ParentInvites.errors).sort(), ["forbidden", "generic", "rate_limited", "unauthorized"]);
    for (const path of ["/account", "/students"]) assert.deepEqual(pickClientMessages(messages, path).ParentInvites, messages.ParentInvites);
  }
});
