import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { DiagnosticShell } from "@/components/diagnostic/DiagnosticShell";
import { TeacherPublicCard } from "@/components/teachers/TeacherPublicCard";
import { createPageMetadata } from "@/constants/seo";
import { getPublicTeacherCard, teacherPublicPath } from "@/modules/teachers";

type TeacherPublicPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: TeacherPublicPageProps) {
  const { slug } = await params;
  const card = await getPublicTeacherCard(slug);
  const t = await getTranslations("Metadata.teacherPublic");

  if (!card) {
    return createPageMetadata({
      title: t("title"),
      description: t("description"),
      path: teacherPublicPath(slug),
      noIndex: true,
    });
  }

  return createPageMetadata({
    title: card.headline
      ? t("titleWithHeadline", { name: card.displayName, headline: card.headline })
      : t("titleNamed", { name: card.displayName }),
    description: card.bio || t("descriptionNamed", { name: card.displayName }),
    path: teacherPublicPath(card.slug),
  });
}

export default async function TeacherPublicPage({
  params,
}: TeacherPublicPageProps) {
  const { slug } = await params;
  const card = await getPublicTeacherCard(slug);
  if (!card) {
    notFound();
  }

  return (
    <DiagnosticShell>
      <TeacherPublicCard card={card} />
    </DiagnosticShell>
  );
}
