import assert from "node:assert/strict";
import test from "node:test";
import type { AuthUser } from "@/modules/auth/types";
import {
  addTeacherStudentAction,
  unlinkTeacherStudentAction,
} from "./actions";
import { linkStudentByLogin } from "./linkStudent";
import { unlinkStudent } from "./unlinkStudent";
import { TeacherStudentsError } from "./types";

const teacher: AuthUser = {
  id: 2,
  login: "demo-teacher",
  displayName: "Ігор Петренко",
  role: "teacher",
};

const admin: AuthUser = {
  id: 3,
  login: "demo-admin",
  displayName: "Адміністратор",
  role: "admin",
};

const student: AuthUser = {
  id: 1,
  login: "demo-student",
  displayName: "Олена Коваленко",
  role: "student",
};

const idleAdd = { status: "idle" as const };
const idleUnlink = { status: "idle" as const };

test("addTeacherStudentAction uses the session user id, not the form", async () => {
  let captured: unknown;
  const spy = (async (input: unknown) => {
    captured = input;
    return {
      created: true,
      student: {
        studentUserId: 1,
        login: "demo-student",
        displayName: "Олена Коваленко",
        createdAt: new Date("2026-09-11T10:00:00.000Z"),
      },
    };
  }) as typeof linkStudentByLogin;

  const form = new FormData();
  form.set("login", "demo-student");
  form.set("teacherUserId", "999");

  const paths: string[] = [];
  const state = await addTeacherStudentAction(idleAdd, form, {
    requireUser: async () => teacher,
    linkStudentByLogin: spy,
    revalidatePath: (path) => {
      paths.push(path);
    },
  });

  assert.deepEqual(state, {
    status: "success",
    displayName: "Олена Коваленко",
    login: "demo-student",
  });
  assert.deepEqual(captured, { teacherUserId: 2, login: "demo-student" });
  assert.deepEqual(paths, ["/students"]);
});

test("addTeacherStudentAction allows admin the same as teacher", async () => {
  let captured: unknown;
  const spy = (async (input: unknown) => {
    captured = input;
    return {
      created: true,
      student: {
        studentUserId: 1,
        login: "demo-student",
        displayName: "Олена Коваленко",
        createdAt: new Date(),
      },
    };
  }) as typeof linkStudentByLogin;

  const form = new FormData();
  form.set("login", "demo-student");
  await addTeacherStudentAction(idleAdd, form, {
    requireUser: async () => admin,
    linkStudentByLogin: spy,
    revalidatePath: () => {},
  });

  assert.deepEqual(captured, { teacherUserId: 3, login: "demo-student" });
});

test("addTeacherStudentAction forbids a student from managing the list", async () => {
  let called = false;
  const spy = (async () => {
    called = true;
    return {
      created: true,
      student: {
        studentUserId: 4,
        login: "other",
        displayName: "Other",
        createdAt: new Date(),
      },
    };
  }) as typeof linkStudentByLogin;

  const form = new FormData();
  form.set("login", "other");
  const state = await addTeacherStudentAction(idleAdd, form, {
    requireUser: async () => student,
    linkStudentByLogin: spy,
    revalidatePath: () => {},
  });

  assert.deepEqual(state, { status: "error", code: "forbidden" });
  assert.equal(called, false);
});

test("addTeacherStudentAction maps domain errors for the client", async () => {
  const spy = (async () => {
    throw new TeacherStudentsError("hidden", "not_found");
  }) as typeof linkStudentByLogin;

  const form = new FormData();
  form.set("login", "ghost");
  const state = await addTeacherStudentAction(idleAdd, form, {
    requireUser: async () => teacher,
    linkStudentByLogin: spy,
    revalidatePath: () => {},
  });

  assert.deepEqual(state, { status: "error", code: "not_found" });
});

test("unlinkTeacherStudentAction scopes delete to the session teacher", async () => {
  let captured: unknown;
  const spy = (async (input: unknown) => {
    captured = input;
  }) as typeof unlinkStudent;

  const form = new FormData();
  form.set("studentUserId", "1");
  form.set("teacherUserId", "999");

  const state = await unlinkTeacherStudentAction(idleUnlink, form, {
    requireUser: async () => teacher,
    unlinkStudent: spy,
    revalidatePath: () => {},
  });

  assert.deepEqual(state, { status: "success" });
  assert.deepEqual(captured, { teacherUserId: 2, studentUserId: 1 });
});

test("unlinkTeacherStudentAction maps a missing pair to not_linked", async () => {
  const spy = (async () => {
    throw new TeacherStudentsError("hidden", "not_found");
  }) as typeof unlinkStudent;

  const form = new FormData();
  form.set("studentUserId", "99");
  const state = await unlinkTeacherStudentAction(idleUnlink, form, {
    requireUser: async () => teacher,
    unlinkStudent: spy,
    revalidatePath: () => {},
  });

  assert.deepEqual(state, { status: "error", code: "not_linked" });
});

test("unlinkTeacherStudentAction forbids a student", async () => {
  let called = false;
  const spy = (async () => {
    called = true;
  }) as typeof unlinkStudent;

  const form = new FormData();
  form.set("studentUserId", "4");
  const state = await unlinkTeacherStudentAction(idleUnlink, form, {
    requireUser: async () => student,
    unlinkStudent: spy,
    revalidatePath: () => {},
  });

  assert.deepEqual(state, { status: "error", code: "forbidden" });
  assert.equal(called, false);
});
