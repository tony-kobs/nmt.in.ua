import {
  LESSON_CURRENCIES,
  TEACHER_LEVELS,
  TEACHING_LANGUAGES,
  TEACHER_PROFILE_BIO_MAX,
  TEACHER_PROFILE_CITY_MAX,
  TEACHER_PROFILE_CONTACT_URL_MAX,
  TEACHER_PROFILE_COUNTRY_MAX,
  TEACHER_PROFILE_EXPERIENCE_MAX,
  TEACHER_PROFILE_HEADLINE_MAX,
  TEACHER_PROFILE_JOIN_MOTIVATION_MAX,
  TEACHER_PROFILE_LESSON_DURATION_MAX,
  TEACHER_PROFILE_LESSON_PRICE_MAX,
  TEACHER_PROFILE_PHONE_MAX,
  TEACHER_PROFILE_PUBLICATIONS_MAX,
  TEACHER_PROFILE_SLUG_MAX,
  TEACHER_PROFILE_SLUG_MIN,
  TEACHER_PROFILE_SUBJECTS_MAX,
  TEACHER_PROFILE_SUBJECT_MAX,
  TEACHER_PROFILE_TEACHING_LANGUAGES_MAX,
  TEACHER_PROFILE_TEACHING_LEVELS_MAX,
  type LessonCurrency,
  type TeacherLevel,
  type TeacherProfileFieldError,
  type TeacherProfileInput,
  type TeachingLanguage,
} from "./types";

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9_-]{1,46}[a-z0-9])$/;
const PHONE_PATTERN = /^\+?[0-9][0-9\s().-]*$/;

const TEACHER_LEVEL_SET = new Set<string>(TEACHER_LEVELS);
const TEACHING_LANGUAGE_SET = new Set<string>(TEACHING_LANGUAGES);
const LESSON_CURRENCY_SET = new Set<string>(LESSON_CURRENCIES);

/**
 * Route prefixes and product words that must not become a public card URL.
 * Keep in sync with `PUBLIC_PAGE_PATHS` / app router folders when adding a
 * top-level public segment.
 */
export const RESERVED_TEACHER_SLUGS = new Set([
  "t",
  "api",
  "login",
  "register",
  "welcome",
  "diagnostic",
  "account",
  "settings",
  "sessions",
  "session",
  "results",
  "simulator",
  "materials",
  "problems",
  "consultations",
  "practice",
  "home",
  "admin",
  "avatar",
  "import",
  "students",
  "join",
  "teacher",
  "teachers",
  "profile",
  "www",
  "static",
  "favicon",
  "og",
  "icons",
  "landing",
  "nmt",
  "verify-email",
  "keep-account",
  "forgot-password",
  "reset-password",
]);

export type ValidatedTeacherProfile = {
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
  contactUrl: string;
  phone: string;
  lessonPrice: number | null;
  lessonCurrency: LessonCurrency | "";
  lessonDurationMinutes: number | null;
  joinMotivation: string;
};

export type TeacherProfileSubmissionError =
  | "headlineRequired"
  | "bioRequired"
  | "experienceRequired"
  | "countryRequired"
  | "subjectsRequired"
  | "teachingLevelsRequired"
  | "teachingLanguagesRequired"
  | "joinMotivationRequired";

export function normalizeSlug(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "-").replace(/-+/g, "-");
}

export function normalizeProfileText(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

export function parseSubjects(raw: string): string[] {
  const seen = new Set<string>();
  const subjects: string[] = [];

  for (const part of raw.split(/[,;\n]+/)) {
    const subject = normalizeProfileText(part);
    if (!subject) continue;

    const key = subject.toLocaleLowerCase("uk");
    if (seen.has(key)) continue;

    seen.add(key);
    subjects.push(subject);
  }

  return subjects;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function parseOptionalNumber(raw: string): number | null {
  const value = raw.trim();
  if (!value) return null;

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isReservedTeacherSlug(slug: string): boolean {
  return RESERVED_TEACHER_SLUGS.has(slug);
}

/**
 * Validates and normalizes teacher profile draft fields.
 * A draft may still be incomplete; submission requirements are checked
 * separately when the teacher sends the profile for moderation.
 */
export function validateTeacherProfileInput(
  input: TeacherProfileInput,
):
  | { ok: true; value: ValidatedTeacherProfile }
  | { ok: false; code: TeacherProfileFieldError } {
  const slug = normalizeSlug(input.slug);
  const headline = normalizeProfileText(input.headline);
  const bio = input.bio.trim().replace(/\r\n/g, "\n");
  const experience = normalizeProfileText(input.experience);
  const publications = input.publications.trim().replace(/\r\n/g, "\n");
  const city = normalizeProfileText(input.city);
  const country = normalizeProfileText(input.country);
  const subjects = parseSubjects(input.subjects);
  const teachingLevels = uniqueStrings(input.teachingLevels);
  const teachingLanguages = uniqueStrings(input.teachingLanguages);
  const contactUrl = input.contactUrl.trim();
  const phone = normalizeProfileText(input.phone);
  const lessonPrice = parseOptionalNumber(input.lessonPrice);
  const lessonCurrency = input.lessonCurrency.trim().toUpperCase();
  const lessonDurationMinutes = parseOptionalNumber(
    input.lessonDurationMinutes,
  );
  const joinMotivation = input.joinMotivation.trim().replace(/\r\n/g, "\n");

  if (!slug) {
    return { ok: false, code: "slugRequired" };
  }

  if (
    slug.length < TEACHER_PROFILE_SLUG_MIN ||
    slug.length > TEACHER_PROFILE_SLUG_MAX ||
    !SLUG_PATTERN.test(slug) ||
    slug.includes("--")
  ) {
    return { ok: false, code: "invalidSlug" };
  }

  if (isReservedTeacherSlug(slug)) {
    return { ok: false, code: "reservedSlug" };
  }

  if (headline.length > TEACHER_PROFILE_HEADLINE_MAX) {
    return { ok: false, code: "headlineTooLong" };
  }

  if (bio.length > TEACHER_PROFILE_BIO_MAX) {
    return { ok: false, code: "bioTooLong" };
  }

  if (experience.length > TEACHER_PROFILE_EXPERIENCE_MAX) {
    return { ok: false, code: "experienceTooLong" };
  }

  if (publications.length > TEACHER_PROFILE_PUBLICATIONS_MAX) {
    return { ok: false, code: "publicationsTooLong" };
  }

  if (city.length > TEACHER_PROFILE_CITY_MAX) {
    return { ok: false, code: "cityTooLong" };
  }

  if (country.length > TEACHER_PROFILE_COUNTRY_MAX) {
    return { ok: false, code: "countryTooLong" };
  }

  if (
    subjects.length > TEACHER_PROFILE_SUBJECTS_MAX ||
    subjects.some((subject) => subject.length > TEACHER_PROFILE_SUBJECT_MAX)
  ) {
    return { ok: false, code: "invalidSubjects" };
  }

  if (
    teachingLevels.length > TEACHER_PROFILE_TEACHING_LEVELS_MAX ||
    teachingLevels.some((level) => !TEACHER_LEVEL_SET.has(level))
  ) {
    return { ok: false, code: "invalidTeachingLevels" };
  }

  if (
    teachingLanguages.length > TEACHER_PROFILE_TEACHING_LANGUAGES_MAX ||
    teachingLanguages.some((language) => !TEACHING_LANGUAGE_SET.has(language))
  ) {
    return { ok: false, code: "invalidTeachingLanguages" };
  }

  if (contactUrl) {
    if (
      contactUrl.length > TEACHER_PROFILE_CONTACT_URL_MAX ||
      !isHttpUrl(contactUrl)
    ) {
      return { ok: false, code: "invalidContactUrl" };
    }
  }

  if (
    phone.length > TEACHER_PROFILE_PHONE_MAX ||
    (phone && !PHONE_PATTERN.test(phone))
  ) {
    return { ok: false, code: "invalidPhone" };
  }

  if (input.lessonPrice.trim()) {
    if (
      lessonPrice === null ||
      lessonPrice <= 0 ||
      lessonPrice > TEACHER_PROFILE_LESSON_PRICE_MAX ||
      !/^\d+(?:\.\d{1,2})?$/.test(input.lessonPrice.trim())
    ) {
      return { ok: false, code: "invalidLessonPrice" };
    }
  }

  if (lessonCurrency && !LESSON_CURRENCY_SET.has(lessonCurrency)) {
    return { ok: false, code: "invalidLessonCurrency" };
  }

  if (
    (lessonPrice !== null && !lessonCurrency) ||
    (lessonPrice === null && lessonCurrency)
  ) {
    return { ok: false, code: "invalidLessonCurrency" };
  }

  if (input.lessonDurationMinutes.trim()) {
    if (
      lessonDurationMinutes === null ||
      !Number.isInteger(lessonDurationMinutes) ||
      lessonDurationMinutes <= 0 ||
      lessonDurationMinutes > TEACHER_PROFILE_LESSON_DURATION_MAX
    ) {
      return { ok: false, code: "invalidLessonDuration" };
    }
  }

  if (joinMotivation.length > TEACHER_PROFILE_JOIN_MOTIVATION_MAX) {
    return { ok: false, code: "joinMotivationTooLong" };
  }

  return {
    ok: true,
    value: {
      slug,
      headline,
      bio,
      experience,
      publications,
      city,
      country,
      subjects,
      teachingLevels: teachingLevels as TeacherLevel[],
      teachingLanguages: teachingLanguages as TeachingLanguage[],
      contactUrl,
      phone,
      lessonPrice,
      lessonCurrency: lessonCurrency as LessonCurrency | "",
      lessonDurationMinutes,
      joinMotivation,
    },
  };
}

/**
 * Checks whether a valid draft contains enough information to be submitted
 * for moderation.
 *
 * Optional for submission:
 * - city
 * - publications
 * - contactUrl
 * - phone
 * - lessonPrice / lessonCurrency
 * - lessonDurationMinutes
 */
export function validateTeacherProfileSubmission(
  profile: ValidatedTeacherProfile,
): { ok: true } | { ok: false; code: TeacherProfileSubmissionError } {
  if (!profile.headline) {
    return { ok: false, code: "headlineRequired" };
  }

  if (!profile.bio) {
    return { ok: false, code: "bioRequired" };
  }

  if (!profile.experience) {
    return { ok: false, code: "experienceRequired" };
  }

  if (!profile.country) {
    return { ok: false, code: "countryRequired" };
  }

  if (profile.subjects.length === 0) {
    return { ok: false, code: "subjectsRequired" };
  }

  if (profile.teachingLevels.length === 0) {
    return { ok: false, code: "teachingLevelsRequired" };
  }

  if (profile.teachingLanguages.length === 0) {
    return { ok: false, code: "teachingLanguagesRequired" };
  }

  if (!profile.joinMotivation) {
    return { ok: false, code: "joinMotivationRequired" };
  }

  return { ok: true };
}
