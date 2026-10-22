import { getTranslations } from "next-intl/server";
import { avatarSrc, userInitials } from "@/modules/auth/client";
import { listPublicTeachersForLanding } from "@/modules/teachers";
import type {
  TeacherLandingCard,
  TeacherLevel,
  TeachingLanguage,
} from "@/modules/teachers/types";
import { TEACHER_OFFER_IDS } from "./offerFeatures";
import { TeachersPanel, type LandingTeacherCard } from "./TeachersPanel";

const MYKHAILO_PHOTO = "/landing/teachers/mykhailo-maksymov.webp";

function landingPhoto(name: string, avatar: string | null): string | null {
  if (/максим|maksym/i.test(name)) return MYKHAILO_PHOTO;
  return avatar;
}

function placeLine(city: string, country: string): string {
  return [city, country].filter((part) => part.trim()).join(", ");
}

export async function Teachers() {
  const t = await getTranslations("WelcomeLanding.teachers");
  const cardT = await getTranslations("TeacherPublicCard");
  let profiles: Awaited<ReturnType<typeof listPublicTeachersForLanding>> = [];
  try {
    profiles = await listPublicTeachersForLanding();
  } catch (error) {
    console.error("welcome: listPublicTeachersForLanding failed", error);
  }

  const levelLabel = (level: TeacherLevel) => cardT(`levels.${level}`);
  const languageLabel = (language: TeachingLanguage) =>
    cardT(`languages.${language}`);

  const toCard = (profile: TeacherLandingCard): LandingTeacherCard => ({
    id: profile.slug,
    photoSrc: landingPhoto(
      profile.displayName,
      avatarSrc({ id: profile.userId, avatarRev: profile.avatarRev }),
    ),
    initials: userInitials(profile.displayName),
    name: profile.displayName,
    subjects: profile.subjects,
    city: placeLine(profile.city, profile.country),
    experience: profile.experience,
    languages: profile.teachingLanguages.map(languageLabel).join(", "),
    levels: profile.teachingLevels.map(levelLabel),
    headline: profile.headline,
    bio: profile.bio,
    publications: profile.publications,
    studentCount: profile.studentCount,
  });

  const demoTeacher: LandingTeacherCard = {
    id: "demo",
    photoSrc: MYKHAILO_PHOTO,
    initials: t("demo.initials"),
    name: t("demo.name"),
    subjects: t("demo.subjects")
      .split(" · ")
      .map((subject) => subject.trim())
      .filter(Boolean),
    city: t("demo.city"),
    experience: t("demo.experience"),
    languages: "",
    levels: [],
    headline: t("demo.headline"),
    bio: t("demo.bio"),
    publications: t("demo.publications"),
    studentCount: 0,
  };

  const teachers = profiles.length > 0 ? profiles.map(toCard) : [demoTeacher];

  const features = TEACHER_OFFER_IDS.map((id) => ({
    id,
    title: t(`features.${id}.title`),
    text: t(`features.${id}.text`),
  }));

  return (
    <TeachersPanel
      teachers={teachers}
      features={features}
      labels={{
        kicker: t("kicker"),
        title: t("title"),
        lead: t("lead"),
        verified: t("verified"),
        city: t("city"),
        experience: t("experience"),
        languages: cardT("teachingLanguages"),
        levels: cardT("teachingLevels"),
        reviews: t.raw("reviews") as string,
        about: cardT("about"),
        publications: cardT("publications"),
        readMore: cardT("readMore"),
        showLess: cardT("showLess"),
        empty: t("empty"),
        carouselAria: t("carouselAria"),
        prev: t("prev"),
        next: t("next"),
        counter: t.raw("counter") as string,
        offerTitle: t("offerTitle"),
        offerLead: t("offerLead"),
        joinCta: t("joinCta"),
        stub: t("stub"),
      }}
    />
  );
}
