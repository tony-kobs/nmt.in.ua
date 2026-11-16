import assert from "node:assert/strict";
import test from "node:test";

import {
  BURCOB_LANDING_FORM_DEFAULT,
  burcobLandingFormUrl,
  isTeacherMediaUrl,
} from "./landingUrl";

test("the landing order link is visible by default and can be replaced", () => {
  assert.equal(burcobLandingFormUrl(undefined), BURCOB_LANDING_FORM_DEFAULT);
  assert.equal(burcobLandingFormUrl(""), null);
  assert.equal(burcobLandingFormUrl("   "), null);
  assert.equal(burcobLandingFormUrl("http://example.com/form"), null);
  assert.equal(
    burcobLandingFormUrl("https://example.com/order"),
    "https://example.com/order",
  );
});

test("a teacher photo is https or a site path", () => {
  assert.equal(isTeacherMediaUrl("https://cdn.example/a.webp"), true);
  assert.equal(isTeacherMediaUrl("/landing/teachers/mykhailo-maksymov.webp"), true);
  assert.equal(isTeacherMediaUrl("http://cdn.example/a.webp"), false);
  assert.equal(isTeacherMediaUrl("//cdn.example/a.webp"), false);
});
