import assert from "node:assert/strict";
import test from "node:test";

import { registerAction, type RegisterActionState } from "./actions";
import { CreateUserError } from "./users";
import type { AuthUser } from "./types";

const IDLE: RegisterActionState = { status: "idle" };

function formDataWith(fields: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }
  return formData;
}

test("registerAction returns validation error without creating a user", async () => {
  const state = await registerAction(
    IDLE,
    formDataWith({
      displayName: "Ok Name",
      email: "ok@example.com",
      password: "short",
      passwordConfirm: "short",
    }),
  );
  assert.deepEqual(state, { status: "error", code: "passwordTooShort" });
});

class Redirected extends Error {
  constructor(readonly path: string) {
    super(`redirect ${path}`);
  }
}

const createdStudent: AuthUser = {
  id: 42,
  login: "maria_k",
  displayName: "Марія Коваленко",
  role: "student",
  cabinetScope: "full",
  email: "maria@example.com",
  emailVerifyRequired: true,
};

function registrationForm(role: "student" | "teacher", extra: Record<string, string> = {}) {
  return formDataWith({
    login: "maria_k",
    displayName: "Марія Коваленко",
    email: "maria@example.com",
    password: "12345678",
    passwordConfirm: "12345678",
    role,
    ...extra,
  });
}

test("registerAction sends the verification letter before leaving for check-email", async () => {
  for (const role of ["student", "teacher"] as const) {
    const events: string[] = [];
    await assert.rejects(
      () =>
        registerAction(IDLE, registrationForm(role), {
          createUser: async () => {
            events.push("user");
            return { ...createdStudent, role };
          },
          sendVerificationMail: async (mail) => {
            events.push(`mail:${mail.email}`);
            assert.equal(mail.userId, 42);
            assert.equal(mail.displayName, "Марія Коваленко");
            return { ok: true };
          },
          redirectTo: (path) => {
            events.push(`redirect:${path}`);
            throw new Redirected(path);
          },
        }),
      (error: unknown) => error instanceof Redirected,
    );
    assert.deepEqual(events, [
      "user",
      "mail:maria@example.com",
      "redirect:/register/check-email?email=maria%40example.com",
    ]);
  }
});

test("registerAction tells the student to resend when the first letter does not leave", async () => {
  const events: string[] = [];
  await assert.rejects(
    () =>
      registerAction(IDLE, registrationForm("student", { from: "diagnostic" }), {
        createUser: async () => {
          events.push("user");
          return createdStudent;
        },
        claimGuestProgress: async (userId) => {
          events.push(`claim:${userId}`);
          return { claimed: false, taskSessions: 0, taskMappings: 0, selfScores: 0 };
        },
        sendVerificationMail: async () => {
          events.push("mail");
          return { ok: false };
        },
        redirectTo: (path) => {
          events.push(path);
          throw new Redirected(path);
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof Redirected);
      assert.equal(
        error.path,
        "/register/check-email?email=maria%40example.com&mail=failed",
      );
      return true;
    },
  );
  assert.deepEqual(events, [
    "user",
    "claim:42",
    "mail",
    "/register/check-email?email=maria%40example.com&mail=failed",
  ]);
});

test("registerAction maps email_taken and skips a taken generated login", async () => {
  const taken = await registerAction(
    IDLE,
    registrationForm("student"),
    {
      createUser: async () => {
        throw new CreateUserError("Email already taken.", "email_taken");
      },
      redirectTo: () => {
        throw new Error("should not redirect");
      },
    },
  );
  assert.deepEqual(taken, { status: "error", code: "emailTaken" });

  let attempts = 0;
  await assert.rejects(
    () =>
      registerAction(IDLE, registrationForm("student"), {
        createUser: async (input) => {
          attempts += 1;
          if (attempts === 1) {
            assert.equal(input.login, "maria");
            throw new CreateUserError("Login already taken.", "login_taken");
          }
          assert.equal(input.login, "maria2");
          return createdStudent;
        },
        sendVerificationMail: async () => ({ ok: true }),
        redirectTo: (path) => {
          throw new Redirected(path);
        },
      }),
    (error: unknown) => error instanceof Redirected,
  );
});
