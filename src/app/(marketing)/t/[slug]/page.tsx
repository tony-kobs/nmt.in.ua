import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { DatabaseUnavailable } from "@/components/status/DatabaseUnavailable";
import { DiagnosticShell } from "@/components/diagnostic/DiagnosticShell";
import { PublicBreadcrumbs } from "@/components/seo/PublicBreadcrumbs";
import { isDatabaseUnavailable, rethrowNavigation } from "@/lib/db/unavailable";
import { TeacherPublicCard } from "@/components/teachers/TeacherPublicCard";
import { createPageMetadata, fitMetaDescription } from "@/constants/seo";
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

  const named = card.headline
    ? t("titleWithHeadline", { name: card.displayName, headline: card.headline })
    : t("titleNamed", { name: card.displayName });
  return createPageMetadata({
    title: named,
    description: fitMetaDescription(
      card.about || card.bio || t("descriptionNamed", { name: card.displayName }),
    ),
    path: teacherPublicPath(card.slug),
    ogImageAlt: card.displayName,
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

  const seo = await getTranslations("Seo");
  return (
    <DiagnosticShell>
      <PublicBreadcrumbs
        label={seo("breadcrumb")}
        items={[
          { name: seo("home"), path: "/" },
          { name: card.displayName, path: teacherPublicPath(card.slug) },
        ]}
      />
      <TeacherPublicCard card={card} heading="h1" />
    </DiagnosticShell>
  );
}
