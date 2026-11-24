import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { DiagnosticShell } from "@/components/diagnostic/DiagnosticShell";
import { NmtTopicArticle } from "@/components/nmtTopics/NmtTopicViews";
import { PublicBreadcrumbs } from "@/components/seo/PublicBreadcrumbs";
import { createPageMetadata, fitMetaDescription } from "@/constants/seo";
import { isDatabaseUnavailable, rethrowNavigation } from "@/lib/db/unavailable";
import { optionalLiveUser } from "@/modules/auth/getCurrentUser";
import { NMT_TOPICS_PATH, nmtTopicPath, publicNmtTopics } from "@/modules/nmtTopics/catalog";
import { loadPublicTopicPage } from "@/modules/nmtTopics/loadTopicPage";

/** Official samples and counts are cached for a day. The sign-in link stays per request. */
export const revalidate = 86_400;

export function generateStaticParams() {
  return publicNmtTopics().map((topic) => ({ slug: topic.slug }));
}

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const page = await loadPublicTopicPage(slug);
  const t = await getTranslations("Metadata.nmtTopics");
  if (!page) {
    const missing = await getTranslations("Metadata.notFound");
    return createPageMetadata({
      title: missing("title"),
      description: missing("description"),
      path: nmtTopicPath(slug),
      noIndex: true,
      omitCanonical: true,
    });
  }
  const summary =
    page.intro.kind === "text"
      ? page.intro.text
      : t("topicDescription", { name: page.title });
  return createPageMetadata({
    title: t("topicTitle", { name: page.title }),
    description: fitMetaDescription(summary),
    path: page.topic.path,
  });
}

async function readerIsLoggedIn(): Promise<boolean> {
  try {
    return Boolean(await optionalLiveUser());
  } catch (error) {
    rethrowNavigation(error);
    if (!isDatabaseUnavailable(error)) throw error;
    return false;
  }
}

export default async function NmtTopicPage({ params }: PageProps) {
  const { slug } = await params;
  const page = await loadPublicTopicPage(slug);
  if (!page) notFound();
  const [seo, loggedIn] = await Promise.all([getTranslations("Seo"), readerIsLoggedIn()]);
  return (
    <DiagnosticShell>
      <PublicBreadcrumbs
        label={seo("breadcrumb")}
        items={[
          { name: seo("home"), path: "/" },
          { name: seo("topics"), path: NMT_TOPICS_PATH },
          { name: page.title, path: page.topic.path },
        ]}
      />
      <NmtTopicArticle page={page} loggedIn={loggedIn} />
    </DiagnosticShell>
  );
}
