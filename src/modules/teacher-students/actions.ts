"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/modules/auth/getCurrentUser";
import { canManageStudents } from "@/modules/auth/types";
import { linkStudentByEmail, LinkStudentByEmailResult } from "./linkStudent";
import { unlinkStudent } from "./unlinkStudent";
import { TeacherStudentsError } from "./types";

export type AddTeacherStudentActionState =
  | { status: "idle" }
  | { status: "success"; displayName: string; login: string }
  | { status: "error"; code: AddTeacherStudentActionErrorCode };

export type AddTeacherStudentActionErrorCode =
  | "invalid_input"
  | "invalid_email"
  | "not_found"
  | "not_a_student"
  | "already_linked"
  | "forbidden"
  | "generic";

export type UnlinkTeacherStudentActionState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; code: UnlinkTeacherStudentActionErrorCode };

export type UnlinkTeacherStudentActionErrorCode =
  | "invalid_input"
  | "not_linked"
  | "forbidden"
  | "generic";

type AddDeps = {
  requireUser: typeof requireUser;
  linkStudentByEmail: typeof linkStudentByEmail;
  revalidatePath: typeof revalidatePath;
};

type UnlinkDeps = {
  requireUser: typeof requireUser;
  unlinkStudent: typeof unlinkStudent;
  revalidatePath: typeof revalidatePath;
};

function mapAddError(
  error: TeacherStudentsError,
): AddTeacherStudentActionErrorCode {
  switch (error.code) {
    case "invalid_input":
    case "invalid_email":
    case "not_found":
    case "not_a_student":
    case "already_linked":
    case "forbidden":
      return error.code;
    default:
      return "generic";
  }
}

function mapUnlinkError(
  error: TeacherStudentsError,
): UnlinkTeacherStudentActionErrorCode {
  switch (error.code) {
    case "invalid_input":
    case "forbidden":
      return error.code;
    case "not_found":
      return "not_linked";
    default:
      return "generic";
  }
}

/**
 * Teacher/admin adds a student by email. Teacher id comes from the session.
 */
export async function addTeacherStudentAction(
  _prev: AddTeacherStudentActionState,
  formData: FormData,
  deps: AddDeps = {
    requireUser,
    linkStudentByEmail,
    revalidatePath,
  },
): Promise<AddTeacherStudentActionState> {
  const user = await deps.requireUser();
  if (!canManageStudents(user.role)) {
    return { status: "error", code: "forbidden" };
  }

  const email = String(formData.get("email") ?? "");

  try {
    const result: LinkStudentByEmailResult = await deps.linkStudentByEmail({
      teacherUserId: user.id,
      email,
    });
    deps.revalidatePath("/students");
    return {
      status: "success",
      displayName: result.student.displayName,
      login: result.student.login,
    };
  } catch (error) {
    if (error instanceof TeacherStudentsError) {
      return { status: "error", code: mapAddError(error) };
    }
    console.error("addTeacherStudentAction: unexpected error", error);
    return { status: "error", code: "generic" };
  }
}

/**
 * Teacher/admin removes a link. Teacher id comes from the session; the
 * student id in the form is scoped to that teacher's rows.
 */
export async function unlinkTeacherStudentAction(
  _prev: UnlinkTeacherStudentActionState,
  formData: FormData,
  deps: UnlinkDeps = {
    requireUser,
    unlinkStudent,
    revalidatePath,
  },
): Promise<UnlinkTeacherStudentActionState> {
  const user = await deps.requireUser();
  if (!canManageStudents(user.role)) {
    return { status: "error", code: "forbidden" };
  }

  const studentUserId = Number(formData.get("studentUserId"));

  try {
    await deps.unlinkStudent({
      teacherUserId: user.id,
      studentUserId,
    });
    deps.revalidatePath("/students");
    return { status: "success" };
  } catch (error) {
    if (error instanceof TeacherStudentsError) {
      return { status: "error", code: mapUnlinkError(error) };
    }
    console.error("unlinkTeacherStudentAction: unexpected error", error);
    return { status: "error", code: "generic" };
  }
}
