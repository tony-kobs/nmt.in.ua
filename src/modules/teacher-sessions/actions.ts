"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/modules/auth/getCurrentUser";
import {
  deleteTeacherSession,
  fillSessionFromBank,
  saveTeacherSession,
  searchSessionBank,
} from "./store";
import {
  MAX_SESSION_TASKS,
  TeacherSessionsError,
  type TeacherSessionsErrorCode,
  type SessionTaskView,
} from "./types";

export type TeacherSessionActionState =
  | { status: "idle" }
  | { status: "error"; code: TeacherSessionsErrorCode | "generic" }
  | { status: "success"; sessionId?: number };

function mapError(error: unknown): TeacherSessionActionState {
  if (error instanceof TeacherSessionsError) {
    return { status: "error", code: error.code };
  }
  console.error("teacher-sessions action: unexpected error", error);
  return { status: "error", code: "generic" };
}

function readTaskIds(formData: FormData): number[] {
  return formData
    .getAll("taskIds")
    .map((value) => Number(value))
    .filter((id) => Number.isInteger(id) && id > 0);
}

export async function saveTeacherSessionAction(
  _prev: TeacherSessionActionState,
  formData: FormData,
): Promise<TeacherSessionActionState> {
  const rawId = String(formData.get("sessionId") ?? "").trim();
  const sessionId = rawId ? Number(rawId) : null;
  try {
    const user = await requireRole(["teacher", "admin"]);
    const detail = await saveTeacherSession({
      teacherUserId: user.id,
      sessionId,
      title: String(formData.get("title") ?? ""),
      themeId: Number(formData.get("themeId")),
      difficulty: Number(formData.get("difficulty")),
      taskIds: readTaskIds(formData),
    });
    revalidatePath("/assign");
    revalidatePath(`/assign/sessions/${detail.id}`);
    if (sessionId == null) {
      redirect(`/assign/sessions/${detail.id}`);
    }
    return { status: "success", sessionId: detail.id };
  } catch (error) {
    if (isRedirect(error)) throw error;
    return mapError(error);
  }
}

export async function deleteTeacherSessionAction(
  _prev: TeacherSessionActionState,
  formData: FormData,
): Promise<TeacherSessionActionState> {
  try {
    const user = await requireRole(["teacher", "admin"]);
    await deleteTeacherSession(Number(formData.get("sessionId")), user.id);
    revalidatePath("/assign");
    redirect("/assign");
  } catch (error) {
    if (isRedirect(error)) throw error;
    return mapError(error);
  }
}

export async function searchSessionBankAction(input: {
  themeId: number;
  query: string;
  difficulty: number | null;
}): Promise<{ status: "ok"; tasks: SessionTaskView[] } | { status: "error" }> {
  try {
    const user = await requireRole(["teacher", "admin"]);
    const tasks = await searchSessionBank(
      user.id,
      input.themeId,
      input.query,
      input.difficulty,
    );
    return { status: "ok", tasks };
  } catch (error) {
    console.error("searchSessionBankAction", error);
    return { status: "error" };
  }
}

export async function fillSessionBankAction(input: {
  themeId: number;
  difficulty: number;
  count: number;
  excludeIds: number[];
}): Promise<{ status: "ok"; tasks: SessionTaskView[] } | { status: "error" }> {
  try {
    const user = await requireRole(["teacher", "admin"]);
    const tasks = await fillSessionFromBank(
      user.id,
      input.themeId,
      input.difficulty,
      Math.min(input.count, MAX_SESSION_TASKS),
      input.excludeIds,
    );
    return { status: "ok", tasks };
  } catch (error) {
    console.error("fillSessionBankAction", error);
    return { status: "error" };
  }
}

function isRedirect(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "digest" in error &&
    String((error as { digest?: unknown }).digest).startsWith("NEXT_REDIRECT")
  );
}
