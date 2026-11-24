import { getTranslations } from "next-intl/server";
import { DiagnosticShell } from "@/components/diagnostic/DiagnosticShell";
import { NmtTopicIndexView } from "@/components/nmtTopics/NmtTopicViews";
import { PublicBreadcrumbs } from "@/components/seo/PublicBreadcrumbs";
import { createPageMetadata } from "@/constants/seo";
import { NMT_TOPICS_PATH } from "@/modules/nmtTopics/catalog";
import { loadPublicTopicCards } from "@/modules/nmtTopics/loadTopicPage";

/** Topic list is cached for a day. Locale still comes from the cookie. */
export const revalidate = 86_400;

export async function generateMetadata() {
  const t = await getTranslations("Metadata.nmtTopics");
  return createPageMetadata({
    title: t("indexTitle"),
    description: t("indexDescription"),
    path: NMT_TOPICS_PATH,
  });
}

export default async function NmtTopicsPage() {
  const seo = await getTranslations("Seo");
  const topics = await loadPublicTopicCards();
  return (
    <DiagnosticShell>
      <PublicBreadcrumbs
        label={seo("breadcrumb")}
        items={[
          { name: seo("home"), path: "/" },
          { name: seo("topics"), path: NMT_TOPICS_PATH },
        ]}
      />
      <NmtTopicIndexView topics={topics} />
    </DiagnosticShell>
  );
}
