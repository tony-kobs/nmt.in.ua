import assert from "node:assert/strict";
import test from "node:test";
import { parentChildHref } from "./childNavigation";

test("child switcher navigates only to a current roster option and resets other query params", () => {
  const children = [{ id: 12, displayName: "First" }, { id: 34, displayName: "Second" }];
  assert.equal(parentChildHref("34", children), "/parent?childId=34");
  for (const value of ["999", "", "012", "34&parentId=1", "/admin"]) {
    assert.equal(parentChildHref(value, children), null);
  }
  assert.equal(parentChildHref("34", []), null);
});
