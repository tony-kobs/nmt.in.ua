import assert from "node:assert/strict";
import test from "node:test";
import { handleCreateParentInvite } from "./createParentInviteAction";
import { validateParentInviteCreation } from "@/validations/parentInviteCreationValidation";

test("action forwards only studentId and backend validates its format", async () => {
  const form = new FormData();
  form.set("studentId", "17"); form.set("role", "admin"); form.set("teacherId", "999"); form.set("authorId", "999");
  const result = await handleCreateParentInvite(form, async (input) => {
    assert.deepEqual(input, { studentId: 17 });
    assert.deepEqual(validateParentInviteCreation(input), { ok: true, value: { studentId: 17 } });
    return { status: "error", code: "forbidden" };
  });
  assert.deepEqual(result, { status: "error", code: "forbidden" });
});

test("empty student request stays compatible and malformed targets fail validation", async () => {
  await handleCreateParentInvite(undefined, async (input) => {
    assert.deepEqual(input, {});
    return { status: "error", code: "unauthorized" };
  });
  for (const studentId of ["-1", "0", "1.2", "1e2", "", "9007199254740992"]) {
    assert.equal(validateParentInviteCreation({ studentId }).ok, false);
    const form = new FormData(); form.set("studentId", studentId);
    assert.deepEqual(await handleCreateParentInvite(form, async () => {
      assert.fail("Invalid target must not reach the backend");
    }), { status: "error", code: "forbidden" });
  }
});
