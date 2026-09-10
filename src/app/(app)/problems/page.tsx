import { getTranslations } from "next-intl/server";
import { PageFrame } from "@/components/dashboard/PageFrame";
import { ProblemsWorkbook } from "@/components/problems/ProblemsWorkbook";
import { getNavItem } from "@/constants/navigation";
import { createPageMetadata } from "@/constants/seo";
import {
  getWorkbookProblems,
  getWorkbookThemes,
} from "@/modules/testing/getProblems";
import { parseThemeQueryParam } from "@/modules/testing/parseThemeQueryParam";

const item = getNavItem("/problems");

export const metadata = createPageMetadata({
  title: item.label,
  description: item.description,
  path: item.href,
});

type ProblemsPageProps = {
  searchParams: Promise<{ theme?: string | string[] }>;
};

function readThemeParam(raw: string | string[] | undefined): string | undefined {
  if (Array.isArray(raw)) return raw[0];
  return raw;
}

export default async function ProblemsPage({ searchParams }: ProblemsPageProps) {
  const t = await getTranslations("ProblemsWorkbook");
  const params = await searchParams;
  const themes = await getWorkbookThemes();
  const requested = parseThemeQueryParam(readThemeParam(params.theme));
  const themeId =
    requested && themes.some((theme) => theme.id === requested)
      ? requested
      : (themes[0]?.id ?? 0);
  const problems = themeId ? await getWorkbookProblems(themeId) : [];

  if (themes.length === 0) {
    return (
      <PageFrame kicker={t("kicker")} title={t("title")} lead={t("empty")}>
        <></>
      </PageFrame>
    );
  }

  return (
    <ProblemsWorkbook themes={themes} themeId={themeId} problems={problems} />
  );
}
