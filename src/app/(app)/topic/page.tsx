import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { TopicTestStart } from "@/components/dashboard/TopicTestStart";
import { createPageMetadata } from "@/constants/seo";
import { requireUser } from "@/modules/auth/getCurrentUser";
import { countStage2CatalogTasks } from "@/modules/stage2/rounds";
import { getAvailableTopicThemes } from "@/modules/testing/getAvailableTopicThemes";
import { parseThemeQueryParam } from "@/modules/testing/parseThemeQueryParam";

type TopicPageProps = {
  searchParams: Promise<{
    theme?: string | string[];
    tab?: string | string[];
  }>;
};

export async function generateMetadata() {
  const t = await getTranslations("Metadata.topic");
  return createPageMetadata({
    title: t("title"),
    description: t("description"),
    path: "/topic",
    noIndex: true,
  });
}

function readParam(raw: string | string[] | undefined): string | undefined {
  return Array.isArray(raw) ? raw[0] : raw;
}

export default async function TopicPage({ searchParams }: TopicPageProps) {
  const user = await requireUser();
  if (user.role === "teacher") redirect("/assign");
  if (user.role === "admin") redirect("/");

  const params = await searchParams;
  const [themes, stage2Count] = await Promise.all([
    getAvailableTopicThemes(),
    countStage2CatalogTasks(),
  ]);

  return (
    <TopicTestStart
      themes={themes}
      initialThemeId={parseThemeQueryParam(readParam(params.theme))}
      displayName={user.displayName}
      interactiveAvailable={stage2Count > 0}
      interactiveBankSize={stage2Count}
      basePath="/topic"
    />
  );
}
