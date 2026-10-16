import assert from "node:assert/strict";
import test from "node:test";

import { registerMarathonAction } from "./actions";
import { CreateUserError } from "@/modules/auth/users";
import type { AuthUser } from "@/modules/auth/types";

class Redirected extends Error {
  constructor(readonly path: string) {
    super(`redirect ${path}`);
  }
}

const student: AuthUser = {
  id: 77,
  login: "pupil",
  displayName: "Олена К",
  role: "student",
  cabinetScope: "full",
  email: "pupil@school.ua",
  emailVerifyRequired: true,
};

function joinForm(): FormData {
  const form = new FormData();
  form.set("slug", "math-5");
  form.set("name", "Олена К");
  form.set("email", "pupil@school.ua");
  form.set("password", "correct-horse");
  form.set("passwordConfirm", "correct-horse");
  return form;
}

test("marathon join sends the verification letter before check-email", async () => {
  const events: string[] = [];
  await assert.rejects(
    () =>
      registerMarathonAction(joinForm(), {
        loadMarathon: async () => {
          events.push("marathon");
          return { id: 5, status: "active" };
        },
        createUser: async (input) => {
          events.push("user");
          assert.equal(input.role, "student");
          assert.equal(input.cabinetScope, "full");
          assert.equal(input.email, "pupil@school.ua");
          return student;
        },
        joinParticipant: async (marathonId, userId) => {
          events.push(`join:${marathonId}:${userId}`);
        },
        sendVerificationMail: async (mail) => {
          events.push(`mail:${mail.email}`);
          assert.equal(mail.userId, 77);
          assert.equal(mail.displayName, "Олена К");
          return { ok: true };
        },
        rememberReturn: async (path) => {
          events.push(`return:${path}`);
        },
        redirectTo: (path) => {
          events.push(`redirect:${path}`);
          throw new Redirected(path);
        },
      }),
    (error: unknown) => error instanceof Redirected,
  );

  assert.deepEqual(events, [
    "marathon",
    "user",
    "join:5:77",
    "mail:pupil@school.ua",
    "return:/marathon/math-5/map",
    "redirect:/register/check-email?email=pupil%40school.ua&next=%2Fmarathon%2Fmath-5%2Fmap",
  ]);
});

test("marathon join points at resend when the first letter does not leave", async () => {
  await assert.rejects(
    () =>
      registerMarathonAction(joinForm(), {
        loadMarathon: async () => ({ id: 5, status: "active" }),
        createUser: async () => student,
        joinParticipant: async () => {},
        sendVerificationMail: async () => ({ ok: false }),
        rememberReturn: async () => {},
        redirectTo: (path) => {
          throw new Redirected(path);
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof Redirected);
      assert.equal(
        error.path,
        "/register/check-email?email=pupil%40school.ua&next=%2Fmarathon%2Fmath-5%2Fmap&mail=failed",
      );
      return true;
    },
  );
});

test("marathon join does not send a letter when the email is already taken", async () => {
  let mailed = false;
  await assert.rejects(
    () =>
      registerMarathonAction(joinForm(), {
        loadMarathon: async () => ({ id: 5, status: "active" }),
        createUser: async () => {
          throw new CreateUserError("Email already taken.", "email_taken");
        },
        sendVerificationMail: async () => {
          mailed = true;
          return { ok: true };
        },
        redirectTo: (path) => {
          throw new Redirected(path);
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof Redirected);
      assert.equal(error.path, "/marathon/math-5/join?error=emailTaken");
      return true;
    },
  );
  assert.equal(mailed, false);
});
