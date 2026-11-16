import type { TeacherProfile } from "@/modules/teachers/types";

export const SLUG_PATTERN = /^[a-z0-9](?:[a-z0-9_-]{1,46}[a-z0-9])$/;
export const PHONE_PATTERN = /^\+?[0-9][0-9\s().-]*$/;
export const LESSON_CURRENCIES = ["UAH", "EUR", "USD", "PLN"] as const;

export type TeacherProfileFormValues = {
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

export type TeacherProfileFormField = keyof TeacherProfileFormValues;

export function getTeacherProfileDefaultValues(
  profile: TeacherProfile,
  suggestedSlug: string,
): TeacherProfileFormValues {
  return {
    slug: profile.slug || suggestedSlug,
    headline: profile.headline,
    bio: profile.bio,
    experience: profile.experience,
    publications: profile.publications,
    city: profile.city,
    country: profile.country,
    subjects: profile.subjects.join(", "),
    teachingLevels: profile.teachingLevels,
    teachingLanguages: profile.teachingLanguages,
    contactUrl: profile.contactUrl,
    externalUrl: profile.externalUrl,
    photoUrl: profile.photoUrl,
    about: profile.about,
    approach: profile.approach,
    program: profile.program,
    reviewName1: profile.reviews[0]?.name ?? "",
    reviewText1: profile.reviews[0]?.text ?? "",
    reviewName2: profile.reviews[1]?.name ?? "",
    reviewText2: profile.reviews[1]?.text ?? "",
    reviewName3: profile.reviews[2]?.name ?? "",
    reviewText3: profile.reviews[2]?.text ?? "",
    phone: profile.phone,
    lessonPrice: profile.lessonPrice?.toString() ?? "",
    lessonCurrency: profile.lessonCurrency,
    lessonDurationMinutes: profile.lessonDurationMinutes?.toString() ?? "",
    joinMotivation: profile.joinMotivation,
  };
}

export function teacherProfileToFormData(
  values: TeacherProfileFormValues,
): FormData {
  const formData = new FormData();

  formData.set("slug", values.slug);
  formData.set("headline", values.headline);
  formData.set("bio", values.bio);
  formData.set("experience", values.experience);
  formData.set("publications", values.publications);
  formData.set("city", values.city);
  formData.set("country", values.country);
  formData.set("subjects", values.subjects);

  values.teachingLevels.forEach((value) =>
    formData.append("teachingLevels", value),
  );
  values.teachingLanguages.forEach((value) =>
    formData.append("teachingLanguages", value),
  );

  formData.set("contactUrl", values.contactUrl);
  formData.set("externalUrl", values.externalUrl);
  formData.set("photoUrl", values.photoUrl);
  formData.set("about", values.about);
  formData.set("approach", values.approach);
  formData.set("program", values.program);
  formData.set("reviewName1", values.reviewName1);
  formData.set("reviewText1", values.reviewText1);
  formData.set("reviewName2", values.reviewName2);
  formData.set("reviewText2", values.reviewText2);
  formData.set("reviewName3", values.reviewName3);
  formData.set("reviewText3", values.reviewText3);
  formData.set("phone", values.phone);
  formData.set("lessonPrice", values.lessonPrice);
  formData.set("lessonCurrency", values.lessonCurrency);
  formData.set("lessonDurationMinutes", values.lessonDurationMinutes);
  formData.set("joinMotivation", values.joinMotivation);

  return formData;
}
