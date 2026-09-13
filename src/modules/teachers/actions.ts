"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/modules/auth/getCurrentUser";
import { saveTeacherProfile, TeacherProfileError } from "./store";
import { canEditTeacherProfile, teacherPublicPath } from "./types";
import type { TeacherProfileFieldError } from "./types";
import { validateTeacherProfileInput } from "./validateProfile";

export type SaveTeacherProfileActionState =
  | { status: "idle" }
  | { status: "ok"; slug: string }
  | { status: "error"; code: TeacherProfileFieldError };

export async function saveTeacherProfileAction(
  _prev: SaveTeacherProfileActionState,
  formData: FormData,
): Promise<SaveTeacherProfileActionState> {
  const user = await requireUser();
  if (!canEditTeacherProfile(user.role)) {
    return { status: "error", code: "forbidden" };
  }

  const validated = validateTeacherProfileInput({
    slug: String(formData.get("slug") ?? ""),
    headline: String(formData.get("headline") ?? ""),
    bio: String(formData.get("bio") ?? ""),
    city: String(formData.get("city") ?? ""),
    subjects: String(formData.get("subjects") ?? ""),
    contactUrl: String(formData.get("contactUrl") ?? ""),
    isPublic: formData.get("isPublic") === "on",
  });

  if (!validated.ok) {
    return { status: "error", code: validated.code };
  }

  try {
    const saved = await saveTeacherProfile(user.id, user.role, validated.value);
    revalidatePath("/account");
    revalidatePath(teacherPublicPath(saved.slug));
    return { status: "ok", slug: saved.slug };
  } catch (error) {
    if (error instanceof TeacherProfileError) {
      return { status: "error", code: error.code };
    }
    console.error("saveTeacherProfileAction failed", error);
    return { status: "error", code: "serverError" };
  }
}
