import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { DatabaseUnavailable } from "@/components/status/DatabaseUnavailable";
import { DiagnosticShell } from "@/components/diagnostic/DiagnosticShell";
import { isDatabaseUnavailable, rethrowNavigation } from "@/lib/db/unavailable";
import { TeacherPublicCard } from "@/components/teachers/TeacherPublicCard";
import { createPageMetadata } from "@/constants/seo";
import { getPublicTeacherCard, teacherPublicPath } from "@/modules/teachers";

type TeacherPublicPageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: TeacherPublicPageProps) {
  const { slug } = await params;
  const t = await getTranslations("Metadata.teacherPublic");
  let card;
  try {
    card = await getPublicTeacherCard(slug);
  } catch (error) {
    rethrowNavigation(error);
    if (!isDatabaseUnavailable(error)) throw error;
    return createPageMetadata({
      title: t("title"),
      description: t("description"),
      path: teacherPublicPath(slug),
      noIndex: true,
    });
  }

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
  let card;
  try {
    card = await getPublicTeacherCard(slug);
  } catch (error) {
    rethrowNavigation(error);
    if (isDatabaseUnavailable(error)) return <DatabaseUnavailable />;
    throw error;
  }
  if (!card) {
    notFound();
  }

  return (
    <DiagnosticShell>
      <TeacherPublicCard card={card} />
    </DiagnosticShell>
  );
}
