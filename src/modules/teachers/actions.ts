"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/modules/auth/getCurrentUser";
import { findUserById } from "@/modules/auth/users";
import { canReviewConsultationRequests } from "@/modules/auth/types";
import {
  getOwnTeacherProfile,
  saveTeacherProfile,
  setTeacherPagePublished,
  submitTeacherProfileForModeration,
  TeacherProfileError,
} from "./store";
import { rateTeacher, RateTeacherError } from "./rateTeacher";
import { canEditTeacherProfile, teacherPublicPath } from "./types";
import type { TeacherProfileFieldError } from "./types";
import {
  validateTeacherProfileInput,
  validateTeacherProfileSubmission,
  type TeacherProfileSubmissionError,
} from "./validateProfile";

export type SaveTeacherProfileActionState =
  | { status: "idle" }
  | { status: "ok"; slug: string }
  | { status: "error"; code: TeacherProfileFieldError };

function parseTeacherProfileFormData(formData: FormData) {
  return {
    slug: String(formData.get("slug") ?? ""),
    headline: String(formData.get("headline") ?? ""),
    bio: String(formData.get("bio") ?? ""),
    experience: String(formData.get("experience") ?? ""),
    publications: String(formData.get("publications") ?? ""),
    city: String(formData.get("city") ?? ""),
    country: String(formData.get("country") ?? ""),
    subjects: String(formData.get("subjects") ?? ""),
    teachingLevels: formData.getAll("teachingLevels").map(String),
    teachingLanguages: formData.getAll("teachingLanguages").map(String),
    contactUrl: String(formData.get("contactUrl") ?? ""),
    externalUrl: String(formData.get("externalUrl") ?? ""),
    photoUrl: String(formData.get("photoUrl") ?? ""),
    about: String(formData.get("about") ?? ""),
    approach: String(formData.get("approach") ?? ""),
    program: String(formData.get("program") ?? ""),
    reviewName1: String(formData.get("reviewName1") ?? ""),
    reviewText1: String(formData.get("reviewText1") ?? ""),
    reviewName2: String(formData.get("reviewName2") ?? ""),
    reviewText2: String(formData.get("reviewText2") ?? ""),
    reviewName3: String(formData.get("reviewName3") ?? ""),
    reviewText3: String(formData.get("reviewText3") ?? ""),
    phone: String(formData.get("phone") ?? ""),
    lessonPrice: String(formData.get("lessonPrice") ?? ""),
    lessonCurrency: String(formData.get("lessonCurrency") ?? ""),
    lessonDurationMinutes: String(formData.get("lessonDurationMinutes") ?? ""),
    joinMotivation: String(formData.get("joinMotivation") ?? ""),
  };
}

export async function saveTeacherProfileAction(
  _prev: SaveTeacherProfileActionState,
  formData: FormData,
): Promise<SaveTeacherProfileActionState> {
  const user = await requireUser();

  if (!canEditTeacherProfile(user.role)) {
    return { status: "error", code: "forbidden" };
  }

  const validated = validateTeacherProfileInput(
    parseTeacherProfileFormData(formData),
  );

  if (!validated.ok) {
    return { status: "error", code: validated.code };
  }

  try {
    const saved = await saveTeacherProfile(user.id, user.role, validated.value);

    revalidatePath("/account");
    revalidatePath("/");
    revalidatePath("/welcome");
    revalidatePath(teacherPublicPath(saved.slug));

    return { status: "ok", slug: saved.slug };
  } catch (error) {
    if (error instanceof TeacherProfileError) {
      if (
        error.code === "slugTaken" ||
        error.code === "forbidden" ||
        error.code === "serverError"
      ) {
        return { status: "error", code: error.code };
      }
    }

    console.error("saveTeacherProfileAction failed", error);
    return { status: "error", code: "serverError" };
  }
}

export type SubmitTeacherProfileActionState =
  | { status: "idle" }
  | { status: "ok" }
  | {
      status: "error";
      code:
        | TeacherProfileFieldError
        | TeacherProfileSubmissionError
        | "displayNameRequired"
        | "emailRequired"
        | "photoRequired"
        | "forbidden"
        | "notFound"
        | "invalidModerationStatus"
        | "serverError";
    };

export async function submitTeacherProfileForModerationAction(
  _prev: SubmitTeacherProfileActionState,
  formData: FormData,
): Promise<SubmitTeacherProfileActionState> {
  const user = await requireUser();

  if (!canEditTeacherProfile(user.role)) {
    return { status: "error", code: "forbidden" };
  }

  const accountUser = await findUserById(user.id);

  if (!accountUser) {
    return { status: "error", code: "notFound" };
  }

  if (!accountUser.displayName.trim()) {
    return { status: "error", code: "displayNameRequired" };
  }

  if (!accountUser.email) {
    return { status: "error", code: "emailRequired" };
  }

  if (!accountUser.avatarRev) {
    return { status: "error", code: "photoRequired" };
  }

  try {
    const validated = validateTeacherProfileInput(
      parseTeacherProfileFormData(formData),
    );

    if (!validated.ok) {
      return { status: "error", code: validated.code };
    }

    await saveTeacherProfile(user.id, user.role, validated.value);
    const profile = await getOwnTeacherProfile(user.id);

    const submissionValidation = validateTeacherProfileSubmission({
      slug: profile.slug,
      headline: profile.headline,
      bio: profile.bio,
      experience: profile.experience,
      publications: profile.publications,
      city: profile.city,
      country: profile.country,
      subjects: profile.subjects,
      teachingLevels: profile.teachingLevels,
      teachingLanguages: profile.teachingLanguages,
      contactUrl: profile.contactUrl,
      phone: profile.phone,
      lessonPrice: profile.lessonPrice,
      lessonCurrency: profile.lessonCurrency,
      lessonDurationMinutes: profile.lessonDurationMinutes,
      joinMotivation: profile.joinMotivation,
    });

    if (!submissionValidation.ok) {
      return {
        status: "error",
        code: submissionValidation.code,
      };
    }

    const submitted = await submitTeacherProfileForModeration(
      user.id,
      user.role,
    );

    revalidatePath("/account");
    revalidatePath("/");
    revalidatePath("/welcome");
    revalidatePath(teacherPublicPath(submitted.slug));

    return { status: "ok" };
  } catch (error) {
    if (error instanceof TeacherProfileError) {
      if (
        error.code === "forbidden" ||
        error.code === "notFound" ||
        error.code === "invalidModerationStatus" ||
        error.code === "serverError"
      ) {
        return { status: "error", code: error.code };
      }
    }

    console.error("submitTeacherProfileForModerationAction failed", error);
    return { status: "error", code: "serverError" };
  }
}

export type RateTeacherActionResult =
  | {
      ok: true;
      teacherUserId: number;
      score: number;
      avgRating: number | null;
      ratingCount: number;
    }
  | {
      ok: false;
      code: "invalid_input" | "forbidden" | "not_found" | "generic";
    };

/** Student rates a public teacher 1–5. Id and score come from trusted session + args. */
export async function rateTeacherAction(
  teacherUserId: number,
  score: number,
): Promise<RateTeacherActionResult> {
  const user = await requireUser();

  if (canReviewConsultationRequests(user.role) || user.role !== "student") {
    return { ok: false, code: "forbidden" };
  }

  try {
    const result = await rateTeacher({
      teacherUserId,
      studentUserId: user.id,
      score,
    });

    revalidatePath("/consultations");

    return {
      ok: true,
      teacherUserId: result.teacherUserId,
      score: result.score,
      avgRating: result.avgRating,
      ratingCount: result.ratingCount,
    };
  } catch (error) {
    if (error instanceof RateTeacherError) {
      if (
        error.code === "invalid_input" ||
        error.code === "forbidden" ||
        error.code === "not_found"
      ) {
        return { ok: false, code: error.code };
      }
    }

    console.error("rateTeacherAction failed", error);
    return { ok: false, code: "generic" };
  }
}

export async function setTeacherPagePublishedAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const role = user.realRole ?? user.role;
  if (!canEditTeacherProfile(role)) redirect("/account");
  try {
    const saved = await setTeacherPagePublished(
      user.id,
      role,
      String(formData.get("published") ?? "") === "1",
    );
    revalidatePath("/account");
    revalidatePath(teacherPublicPath(saved.slug));
  } catch (error) {
    console.error("setTeacherPagePublishedAction failed", error);
  }
  redirect("/account");
}
