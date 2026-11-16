import { JsonLd } from "@/components/seo/JsonLd";
import { absoluteUrl } from "@/constants/seo";
import type { PublicTeacherCard } from "@/modules/teachers";
import { teacherPublicPath } from "@/modules/teachers";
import { TeacherPublicCardView } from "./TeacherPublicCardView";

type TeacherPublicCardProps = {
  card: PublicTeacherCard;
  showCta?: boolean;
};

export function TeacherPublicCard({
  card,
  showCta = true,
}: TeacherPublicCardProps) {
  const path = teacherPublicPath(card.slug);

  const personLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: card.displayName,
    url: absoluteUrl(path),
  };

  if (card.headline) {
    personLd.jobTitle = card.headline;
  }

  if (card.bio) {
    personLd.description = card.bio;
  }

  if (card.city || card.country) {
    personLd.address = {
      "@type": "PostalAddress",
      ...(card.city ? { addressLocality: card.city } : {}),
      ...(card.country ? { addressCountry: card.country } : {}),
    };
  }

  if (card.contactUrl) {
    personLd.sameAs = [card.contactUrl];
  }

  return (
    <>
      <JsonLd data={personLd} />
      <TeacherPublicCardView card={card} showCta={showCta} layout="page" />
    </>
  );
}
