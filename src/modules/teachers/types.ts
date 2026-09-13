import type { UserRole } from "@/modules/auth/types";

export const TEACHER_PROFILE_SLUG_MIN = 3;
export const TEACHER_PROFILE_SLUG_MAX = 48;
export const TEACHER_PROFILE_HEADLINE_MAX = 160;
export const TEACHER_PROFILE_BIO_MAX = 2000;
export const TEACHER_PROFILE_CITY_MAX = 80;
export const TEACHER_PROFILE_SUBJECTS_MAX = 8;
export const TEACHER_PROFILE_SUBJECT_MAX = 40;
export const TEACHER_PROFILE_CONTACT_URL_MAX = 500;

export type TeacherProfile = {
  userId: number;
  slug: string;
  headline: string;
  bio: string;
  city: string;
  subjects: string[];
  contactUrl: string;
  isPublic: boolean;
};

export type PublicTeacherCard = TeacherProfile & {
  displayName: string;
  login: string;
  role: UserRole;
  avatarRev?: number;
};

export type TeacherProfileInput = {
  slug: string;
  headline: string;
  bio: string;
  city: string;
  subjects: string;
  contactUrl: string;
  isPublic: boolean;
};

export type TeacherProfileFieldError =
  | "slugRequired"
  | "invalidSlug"
  | "reservedSlug"
  | "slugTaken"
  | "headlineTooLong"
  | "bioTooLong"
  | "cityTooLong"
  | "invalidSubjects"
  | "invalidContactUrl"
  | "forbidden"
  | "serverError";

export function canEditTeacherProfile(role: UserRole): boolean {
  return role === "teacher" || role === "admin";
}

export function teacherPublicPath(slug: string): string {
  return `/t/${slug}`;
}

export function emptyTeacherProfile(userId: number): TeacherProfile {
  return {
    userId,
    slug: "",
    headline: "",
    bio: "",
    city: "",
    subjects: [],
    contactUrl: "",
    isPublic: false,
  };
}
