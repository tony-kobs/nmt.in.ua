import { JsonLd } from "@/components/seo/JsonLd";
import { buildTeacherProfileJsonLd } from "@/constants/seo";
import type { PublicTeacherCard } from "@/modules/teachers";
import { teacherPublicPath } from "@/modules/teachers";
import { TeacherPublicCardView } from "./TeacherPublicCardView";

type TeacherPublicCardProps = {
  card: PublicTeacherCard;
  showCta?: boolean;
  /** Public `/t/{slug}` is the only place this name is the page h1. */
  heading?: "h1" | "p";
};

export function TeacherPublicCard({
  card,
  showCta = true,
  heading = "p",
}: TeacherPublicCardProps) {
  const path = teacherPublicPath(card.slug);
  const profileLd = buildTeacherProfileJsonLd({
    name: card.displayName,
    path,
    headline: card.headline,
    description: card.about || card.bio || null,
    city: card.city,
    country: card.country,
    contactUrl: card.contactUrl,
    image: card.photoUrl,
  });

  return (
    <>
      <JsonLd data={profileLd} />
      <TeacherPublicCardView card={card} showCta={showCta} layout="page" heading={heading} />
    </>
  );
}
