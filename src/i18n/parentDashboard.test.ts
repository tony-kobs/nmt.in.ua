import assert from "node:assert/strict";
import test from "node:test";
import uk from "../../messages/uk.json";
import en from "../../messages/en.json";
import de from "../../messages/de.json";
import { pickClientMessages } from "./clientMessages";

test("parent dashboard translations cover all locales and cabinet soft navigations", () => {
  for (const messages of [uk, en, de]) {
    assert.deepEqual(Object.keys(messages.ParentDashboard).sort(), Object.keys(uk.ParentDashboard).sort());
    assert.ok(Object.values(messages.ParentDashboard).every((value) => value.trim()));
    for (const path of ["/parent", "/account", "/students"]) {
      assert.deepEqual(pickClientMessages(messages, path).ParentDashboard, messages.ParentDashboard);
    }
    assert.ok(messages.RecentResults.startedAt.includes("{date}"));
    assert.ok(messages.RecentResults.unknownDate);
  }
});
