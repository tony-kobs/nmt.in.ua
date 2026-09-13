import {
  TEACHER_PROFILE_BIO_MAX,
  TEACHER_PROFILE_CITY_MAX,
  TEACHER_PROFILE_CONTACT_URL_MAX,
  TEACHER_PROFILE_HEADLINE_MAX,
  TEACHER_PROFILE_SLUG_MAX,
  TEACHER_PROFILE_SLUG_MIN,
  TEACHER_PROFILE_SUBJECTS_MAX,
  TEACHER_PROFILE_SUBJECT_MAX,
  type TeacherProfileFieldError,
  type TeacherProfileInput,
} from "./types";

const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/;

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
]);

export type ValidatedTeacherProfile = {
  slug: string;
  headline: string;
  bio: string;
  city: string;
  subjects: string[];
  contactUrl: string;
  isPublic: boolean;
};

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

export function isReservedTeacherSlug(slug: string): boolean {
  return RESERVED_TEACHER_SLUGS.has(slug);
}

/**
 * Validates the public teacher card fields (slug, copy, contact).
 * Slug is always required on save so the unique index stays simple.
 */
export function validateTeacherProfileInput(
  input: TeacherProfileInput,
):
  | { ok: true; value: ValidatedTeacherProfile }
  | { ok: false; code: TeacherProfileFieldError } {
  const slug = normalizeSlug(input.slug);
  const headline = normalizeProfileText(input.headline);
  const bio = input.bio.trim().replace(/\r\n/g, "\n");
  const city = normalizeProfileText(input.city);
  const subjects = parseSubjects(input.subjects);
  const contactUrl = input.contactUrl.trim();

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

  if (city.length > TEACHER_PROFILE_CITY_MAX) {
    return { ok: false, code: "cityTooLong" };
  }

  if (
    subjects.length > TEACHER_PROFILE_SUBJECTS_MAX ||
    subjects.some((subject) => subject.length > TEACHER_PROFILE_SUBJECT_MAX)
  ) {
    return { ok: false, code: "invalidSubjects" };
  }

  if (contactUrl) {
    if (
      contactUrl.length > TEACHER_PROFILE_CONTACT_URL_MAX ||
      !isHttpUrl(contactUrl)
    ) {
      return { ok: false, code: "invalidContactUrl" };
    }
  }

  return {
    ok: true,
    value: {
      slug,
      headline,
      bio,
      city,
      subjects,
      contactUrl,
      isPublic: Boolean(input.isPublic),
    },
  };
}
