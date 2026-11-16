import type { UserRole } from "@/modules/auth/types";

export const TEACHER_PROFILE_SLUG_MIN = 3;
export const TEACHER_PROFILE_SLUG_MAX = 48;
export const TEACHER_PROFILE_HEADLINE_MAX = 160;
export const TEACHER_PROFILE_BIO_MAX = 2000;
export const TEACHER_PROFILE_EXPERIENCE_MAX = 160;
export const TEACHER_PROFILE_PUBLICATIONS_MAX = 2000;
export const TEACHER_PROFILE_CITY_MAX = 80;
export const TEACHER_PROFILE_SUBJECTS_MAX = 8;
export const TEACHER_PROFILE_SUBJECT_MAX = 40;
export const TEACHER_PROFILE_CONTACT_URL_MAX = 500;

export const TEACHER_PROFILE_COUNTRY_MAX = 80;
export const TEACHER_PROFILE_PHONE_MAX = 32;
export const TEACHER_PROFILE_TEACHING_LEVELS_MAX = 8;
export const TEACHER_PROFILE_TEACHING_LANGUAGES_MAX = 8;
export const TEACHER_PROFILE_JOIN_MOTIVATION_MAX = 2000;
export const TEACHER_PROFILE_LESSON_PRICE_MAX = 100000;
export const TEACHER_PROFILE_LESSON_DURATION_MAX = 300;
export const TEACHER_PROFILE_ABOUT_MAX = 4000;
export const TEACHER_PROFILE_APPROACH_MAX = 4000;
export const TEACHER_PROFILE_PROGRAM_MAX = 4000;
export const TEACHER_REVIEW_LIMIT = 3;
export const TEACHER_REVIEW_NAME_MAX = 80;
export const TEACHER_REVIEW_TEXT_MAX = 500;

export type TeacherReview = {
  name: string;
  text: string;
};

export const TEACHER_LEVELS = [
  "grades_5_9",
  "grades_10_11",
  "nmt",
  "adult",
] as const;

export type TeacherLevel = (typeof TEACHER_LEVELS)[number];

export const TEACHING_LANGUAGES = ["uk", "en", "de", "pl"] as const;

export type TeachingLanguage = (typeof TEACHING_LANGUAGES)[number];

export const LESSON_CURRENCIES = ["UAH", "EUR", "USD", "PLN"] as const;

export type LessonCurrency = (typeof LESSON_CURRENCIES)[number];

export type TeacherModerationStatus =
  | "draft"
  | "pending"
  | "approved"
  | "rejected";

export type TeacherProfile = {
  userId: number;
  slug: string;
  headline: string;
  bio: string;
  photoUrl: string;
  about: string;
  approach: string;
  program: string;
  reviews: TeacherReview[];
  experience: string;
  publications: string;
  city: string;
  country: string;
  subjects: string[];
  teachingLevels: TeacherLevel[];
  teachingLanguages: TeachingLanguage[];
  contactUrl: string;
  externalUrl: string;
  phone: string;
  lessonPrice: number | null;
  lessonCurrency: LessonCurrency | "";
  lessonDurationMinutes: number | null;
  joinMotivation: string;
  moderationStatus: TeacherModerationStatus;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  reviewedBy: number | null;
  rejectionReason: string;
  isPublic: boolean;
};

export type PublicTeacherCard = {
  userId: number;
  slug: string;
  headline: string;
  bio: string;
  experience: string;
  publications: string;
  city: string;
  country: string;
  subjects: string[];
  teachingLevels: TeacherLevel[];
  teachingLanguages: TeachingLanguage[];
  lessonPrice: number | null;
  lessonCurrency: LessonCurrency | "";
  lessonDurationMinutes: number | null;
  contactUrl: string;
  externalUrl: string;
  photoUrl: string;
  about: string;
  approach: string;
  program: string;
  reviews: TeacherReview[];
  isPublic: boolean;
  displayName: string;
  login: string;
  role: UserRole;
  avatarRev?: number;
};

/** Public card plus rating stats for the consultations carousel. */
export type TeacherCarouselItem = PublicTeacherCard & {
  avgRating: number | null;
  ratingCount: number;
  myRating: number | null;
};

export type TeacherProfileInput = {
  slug: string;
  headline: string;
  bio: string;
  experience: string;
  publications: string;
  city: string;
  country: string;
  subjects: string;
  teachingLevels: string[];
  teachingLanguages: string[];
  contactUrl: string;
  externalUrl: string;
  photoUrl: string;
  about: string;
  approach: string;
  program: string;
  reviewName1: string;
  reviewText1: string;
  reviewName2: string;
  reviewText2: string;
  reviewName3: string;
  reviewText3: string;
  phone: string;
  lessonPrice: string;
  lessonCurrency: string;
  lessonDurationMinutes: string;
  joinMotivation: string;
};

/** Public teacher card for the welcome landing swiper. */
export type TeacherLandingCard = PublicTeacherCard & {
  studentCount: number;
};

export type TeacherProfileFieldError =
  | "slugRequired"
  | "invalidSlug"
  | "reservedSlug"
  | "slugTaken"
  | "headlineTooLong"
  | "bioTooLong"
  | "experienceTooLong"
  | "publicationsTooLong"
  | "cityTooLong"
  | "invalidSubjects"
  | "invalidContactUrl"
  | "invalidExternalUrl"
  | "invalidPhotoUrl"
  | "aboutTooLong"
  | "approachTooLong"
  | "programTooLong"
  | "invalidReviews"
  | "countryTooLong"
  | "invalidTeachingLevels"
  | "invalidTeachingLanguages"
  | "invalidPhone"
  | "invalidLessonPrice"
  | "invalidLessonCurrency"
  | "invalidLessonDuration"
  | "joinMotivationTooLong"
  | "forbidden"
  | "serverError";

export function canEditTeacherProfile(role: UserRole): boolean {
  return role === "teacher";
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
    photoUrl: "",
    about: "",
    approach: "",
    program: "",
    reviews: [],
    experience: "",
    publications: "",
    city: "",
    country: "",
    subjects: [],
    teachingLevels: [],
    teachingLanguages: [],
    contactUrl: "",
    externalUrl: "",
    phone: "",
    lessonPrice: null,
    lessonCurrency: "",
    lessonDurationMinutes: null,
    joinMotivation: "",
    moderationStatus: "draft",
    submittedAt: null,
    reviewedAt: null,
    reviewedBy: null,
    rejectionReason: "",
    isPublic: false,
  };
}
