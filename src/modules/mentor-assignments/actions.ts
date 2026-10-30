"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/modules/auth/getCurrentUser";
import {
  cancelMentorAssignment,
  createMentorAssignment,
  updateMentorAssignmentMembers,
} from "./assignments";
import {
  MentorAssignmentsError,
  type MentorAssignmentsErrorCode,
} from "./types";

export type MentorAssignmentActionState =
  | { status: "idle" }
  | { status: "error"; code: MentorAssignmentsErrorCode | "generic" }
  | { status: "success"; assignmentId?: number };

function mapError(error: unknown): MentorAssignmentActionState {
  if (error instanceof MentorAssignmentsError) {
    return { status: "error", code: error.code };
  }
  console.error("mentor-assignments action: unexpected error", error);
  return { status: "error", code: "generic" };
}

function readStudentIds(formData: FormData): number[] {
  return formData
    .getAll("studentIds")
    .map((value) => Number(value))
    .filter((id) => Number.isInteger(id) && id > 0);
}

function readDifficulty(formData: FormData): number {
  return Number(formData.get("difficulty"));
}

function readScheduleMode(formData: FormData): "now" | "datetime" {
  const raw = String(formData.get("scheduleMode") ?? "now");
  return raw === "datetime" ? "datetime" : "now";
}

function readLocalDateTimeUnix(formData: FormData, key: string): number | null {
  const local = String(formData.get(key) ?? "").trim();
  if (!local) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(
    local
  );
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = Number(match[4]);
    const minute = Number(match[5]);
    const second = Number(match[6] ?? 0);
    const ms = new Date(year, month - 1, day, hour, minute, second).getTime();
    if (!Number.isFinite(ms)) return null;
    return Math.floor(ms / 1000);
  }
  const ms = Date.parse(local);
  if (!Number.isFinite(ms)) return null;
  return Math.floor(ms / 1000);
}

export async function createMentorAssignmentAction(
  _prev: MentorAssignmentActionState,
  formData: FormData
): Promise<MentorAssignmentActionState> {
  try {
    const user = await requireRole(["teacher", "admin"]);
    const rawSession = String(formData.get("learningSessionId") ?? "").trim();
    const learningSessionId = rawSession ? Number(rawSession) : null;
    const themeId = Number(formData.get("themeId"));
    const detail = await createMentorAssignment({
      teacherUserId: user.id,
      themeId: Number.isInteger(themeId) && themeId > 0 ? themeId : 0,
      difficulty: readDifficulty(formData),
      studentIds: readStudentIds(formData),
      sessionId: learningSessionId,
      scheduleMode: readScheduleMode(formData),
      availableAtUnix: readLocalDateTimeUnix(formData, "availableAtLocal"),
      dueAtUnix: readLocalDateTimeUnix(formData, "dueAtLocal"),
    });
    revalidatePath("/assign");
    revalidatePath("/sessions");
    return { status: "success", assignmentId: detail.id };
  } catch (error) {
    return mapError(error);
  }
}

export async function cancelMentorAssignmentAction(
  _prev: MentorAssignmentActionState,
  formData: FormData
): Promise<MentorAssignmentActionState> {
  try {
    const user = await requireRole(["teacher", "admin"]);
    const assignmentId = Number(formData.get("assignmentId"));
    await cancelMentorAssignment(assignmentId, user.id);
    revalidatePath("/assign");
    revalidatePath("/sessions");
    return { status: "success", assignmentId };
  } catch (error) {
    return mapError(error);
  }
}

export async function updateMentorAssignmentMembersAction(
  _prev: MentorAssignmentActionState,
  formData: FormData
): Promise<MentorAssignmentActionState> {
  try {
    const user = await requireRole(["teacher", "admin"]);
    const assignmentId = Number(formData.get("assignmentId"));
    const detail = await updateMentorAssignmentMembers({
      assignmentId,
      teacherUserId: user.id,
      studentIds: readStudentIds(formData),
    });
    revalidatePath("/assign");
    revalidatePath("/sessions");
    return { status: "success", assignmentId: detail.id };
  } catch (error) {
    return mapError(error);
  }
}
