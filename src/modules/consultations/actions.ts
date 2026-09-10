"use server";

import { revalidatePath } from "next/cache";
import { requireRole, requireUser } from "@/modules/auth/getCurrentUser";
import { canReviewConsultationRequests } from "@/modules/auth/types";
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

  const note = String(formData.get("note") ?? "");

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
  const user = await deps.requireRole(["teacher", "admin"]);
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
