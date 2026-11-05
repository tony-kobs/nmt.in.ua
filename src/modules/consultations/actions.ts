"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireUser } from "@/modules/auth/getCurrentUser";
import {
  canManageStudents,
  canReviewConsultationRequests,
  TEACHING_STAFF_ROLES,
} from "@/modules/auth/types";
import {
  attachConsultationStudent,
  type AttachConsultationResult,
} from "@/modules/teacher-students/attachConsultation";
import { TeacherStudentsError } from "@/modules/teacher-students/types";
import {
  createConsultationRequest,
  CreateConsultationRequestError,
} from "./createConsultationRequest";
import {
  updateConsultationRequestStatus,
  UpdateConsultationStatusError,
} from "./updateConsultationRequestStatus";
import {
  isConsultationStatus,
  toConsultationRequestView,
  type ConsultationRequestView,
  type ConsultationStatus,
} from "./types";

export type CreateConsultationActionState =
  | { status: "idle" }
  | { status: "success"; created: boolean; request: ConsultationRequestView }
  | { status: "error"; code: CreateConsultationActionErrorCode };

export type CreateConsultationActionErrorCode =
  | "invalid_input"
  | "forbidden"
  | "generic";

export type UpdateConsultationActionState =
  | { status: "idle" }
  | { status: "success"; request: ConsultationRequestView }
  | { status: "error"; code: UpdateConsultationActionErrorCode };

export type UpdateConsultationActionErrorCode =
  | "invalid_input"
  | "notFound"
  | "invalidTransition"
  | "generic";

type CreateDeps = {
  requireUser: typeof requireUser;
  createConsultationRequest: typeof createConsultationRequest;
  revalidatePath: typeof revalidatePath;
};

type UpdateDeps = {
  requireRole: typeof requireRole;
  updateConsultationRequestStatus: typeof updateConsultationRequestStatus;
  revalidatePath: typeof revalidatePath;
};

/**
 * Student creates one open consultation request. User id comes from the
 * session, never from the form.
 */
export async function createConsultationRequestAction(
  _prev: CreateConsultationActionState,
  formData: FormData,
  deps: CreateDeps = {
    requireUser,
    createConsultationRequest,
    revalidatePath,
  },
): Promise<CreateConsultationActionState> {
  const user = await deps.requireUser();
  if (canReviewConsultationRequests(user.role)) {
    return { status: "error", code: "forbidden" };
  }
  if (user.role !== "student") {
    return { status: "error", code: "forbidden" };
  }

  const noteRaw = String(formData.get("note") ?? "").trim();
  const personalNotePrefix = String(formData.get("personalNotePrefix") ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 160);
  const note = personalNotePrefix
    ? noteRaw
      ? `${personalNotePrefix} ${noteRaw}`
      : personalNotePrefix
    : noteRaw;

  try {
    const result = await deps.createConsultationRequest({
      studentId: user.id,
      note,
    });
    deps.revalidatePath("/consultations");
    return {
      status: "success",
      created: result.created,
      request: toConsultationRequestView(result.request),
    };
  } catch (error) {
    if (error instanceof CreateConsultationRequestError) {
      if (error.code === "invalid_input" || error.code === "forbidden") {
        return { status: "error", code: error.code };
      }
    }
    console.error("createConsultationRequestAction: unexpected error", error);
    return { status: "error", code: "generic" };
  }
}

/**
 * Teacher/admin acknowledges or closes a request. Handler id comes from
 * the session, never from the form.
 */
export async function updateConsultationRequestStatusAction(
  _prev: UpdateConsultationActionState,
  formData: FormData,
  deps: UpdateDeps = {
    requireRole,
    updateConsultationRequestStatus,
    revalidatePath,
  },
): Promise<UpdateConsultationActionState> {
  const user = await deps.requireRole(TEACHING_STAFF_ROLES);
  const requestId = Number(formData.get("requestId"));
  const status = formData.get("status");

  if (!isConsultationStatus(status)) {
    return { status: "error", code: "invalid_input" };
  }

  const nextStatus: ConsultationStatus = status;

  try {
    const request = await deps.updateConsultationRequestStatus({
      requestId,
      status: nextStatus,
      handledBy: user.id,
    });
    deps.revalidatePath("/consultations");
    return {
      status: "success",
      request: toConsultationRequestView(request),
    };
  } catch (error) {
    if (error instanceof UpdateConsultationStatusError) {
      switch (error.code) {
        case "invalid_input":
          return { status: "error", code: "invalid_input" };
        case "not_found":
          return { status: "error", code: "notFound" };
        case "invalid_transition":
          return { status: "error", code: "invalidTransition" };
        default:
          return { status: "error", code: "generic" };
      }
    }
    console.error(
      "updateConsultationRequestStatusAction: unexpected error",
      error,
    );
    return { status: "error", code: "generic" };
  }
}

export type AttachConsultationActionState =
  | { status: "idle" }
  | {
      status: "success";
      studentName: string;
      groupName: string | null;
    }
  | { status: "error"; code: AttachConsultationActionErrorCode };

export type AttachConsultationActionErrorCode =
  | "invalid_input"
  | "not_found"
  | "not_a_student"
  | "group_not_found"
  | "forbidden"
  | "generic";

type AttachDeps = {
  requireUser: typeof requireUser;
  attachConsultationStudent: typeof attachConsultationStudent;
  revalidatePath: typeof revalidatePath;
};

function mapAttachError(
  error: TeacherStudentsError,
): AttachConsultationActionErrorCode {
  switch (error.code) {
    case "invalid_input":
    case "not_found":
    case "not_a_student":
    case "group_not_found":
    case "forbidden":
      return error.code;
    default:
      return "generic";
  }
}

/**
 * Teacher/admin links the student from a consultation request.
 * Teacher id comes from the session. Personal adds the roster link only;
 * group also places the student in one existing group (replacing any other).
 */
export async function attachConsultationStudentAction(
  _prev: AttachConsultationActionState,
  formData: FormData,
  deps: AttachDeps = {
    requireUser,
    attachConsultationStudent,
    revalidatePath,
  },
): Promise<AttachConsultationActionState> {
  const user = await deps.requireUser();
  if (!canManageStudents(user.role)) {
    return { status: "error", code: "forbidden" };
  }

  const placement = formData.get("placement") === "group" ? "group" : "personal";
  const rawGroup = String(formData.get("groupId") ?? "").trim();

  try {
    const result: AttachConsultationResult = await deps.attachConsultationStudent({
      teacherUserId: user.id,
      requestId: Number(formData.get("requestId")),
      placement,
      groupId: placement === "group" ? Number(rawGroup) : null,
    });
    deps.revalidatePath("/consultations");
    deps.revalidatePath("/students");
    deps.revalidatePath("/results");
    deps.revalidatePath("/sessions");
    return {
      status: "success",
      studentName: result.studentDisplayName,
      groupName: result.groupName,
    };
  } catch (error) {
    if (error instanceof TeacherStudentsError) {
      return { status: "error", code: mapAttachError(error) };
    }
    console.error("attachConsultationStudentAction: unexpected error", error);
    return { status: "error", code: "generic" };
  }
}
