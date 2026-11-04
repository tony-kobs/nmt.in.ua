import assert from "node:assert/strict";
import test from "node:test";

import { splitPersonalConsultationNote } from "./personalNote";

test("a personal prefix becomes a name and the student's text", () => {
  assert.deepEqual(
    splitPersonalConsultationNote("[Персональна · Михайло Максимов] test"),
    { teacherName: "Михайло Максимов", message: "test" },
  );
  assert.equal(
    splitPersonalConsultationNote("Звичайний запит"),
    null,
  );
});
