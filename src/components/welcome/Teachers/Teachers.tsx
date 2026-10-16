import { getTranslations } from "next-intl/server";
import { avatarSrc, userInitials } from "@/modules/auth/client";
import { listPublicTeachersForLanding } from "@/modules/teachers";
import { TEACHER_OFFER_IDS } from "./offerFeatures";
import { TeachersPanel, type LandingTeacherCard } from "./TeachersPanel";

function splitBio(bio: string): { lead: string; rest: string } {
  const trimmed = bio.trim();
  if (!trimmed) return { lead: "", rest: "" };
  const parts = trimmed.split(/(?<=[.!?…])\s+/);
  if (parts.length <= 1) return { lead: trimmed, rest: "" };
  return { lead: parts[0]!, rest: parts.slice(1).join(" ") };
}

export async function Teachers() {
  const t = await getTranslations("WelcomeLanding.teachers");
  let profiles: Awaited<ReturnType<typeof listPublicTeachersForLanding>> = [];
  try {
    profiles = await listPublicTeachersForLanding();
  } catch (error) {
    console.error("welcome: listPublicTeachersForLanding failed", error);
  }

  const fromDb: LandingTeacherCard[] = profiles.map((profile) => {
    const bio = splitBio(profile.bio || profile.headline);
    return {
      id: profile.slug,
      photoSrc: avatarSrc({ id: profile.userId, avatarRev: profile.avatarRev }),
      initials: userInitials(profile.displayName),
      name: profile.displayName,
      subject:
        profile.subjects.length > 0
          ? profile.subjects.join(" · ")
          : profile.headline || profile.city || "—",
      education: profile.city || "",
      experience: profile.experience || "",
      bioLead: bio.lead || profile.headline || "—",
      bioRest: bio.rest || profile.publications || "",
      rating: 0,
      reviewCount: profile.studentCount,
    };
  });

  const demoTeacher: LandingTeacherCard = {
    id: "demo",
    photoSrc: null,
    initials: t("demo.initials"),
    name: t("demo.name"),
    subject: t("demo.subjects"),
    education: t("demo.city"),
    experience: t("demo.experience"),
    bioLead: t("demo.headline"),
    bioRest: [t("demo.bio"), t("demo.publications")].filter(Boolean).join(" "),
    rating: 0,
    reviewCount: 0,
  };

  const teachers = fromDb.length > 0 ? fromDb : [demoTeacher];

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
        education: t("city"),
        experience: t("experience"),
        reviews: t.raw("reviews") as string,
        empty: t("empty"),
        carouselAria: t("carouselAria"),
        prev: t("prev"),
        next: t("next"),
        counter: t.raw("counter") as string,
        offerTitle: t("offerTitle"),
        offerLead: t("offerLead"),
        joinCta: t("joinCta"),
      }}
    />
  );
}
