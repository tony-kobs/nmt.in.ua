import { getTranslations } from "next-intl/server";
import { PageFrame } from "@/components/dashboard/PageFrame";
import { ProblemsWorkbook } from "@/components/problems/ProblemsWorkbook";
import { getNavItem } from "@/constants/navigation";
import { createPageMetadata } from "@/constants/seo";
import {
  getWorkbookProblems,
  getWorkbookThemes,
  resolveWorkbookThemeKey,
} from "@/modules/testing/getProblems";
import { isQueryFlagOn, readSearchParam } from "@/lib/queryHref";

const item = getNavItem("/problems");

export const metadata = createPageMetadata({
  title: item.label,
  description: item.description,
  path: item.href,
});

type ProblemsPageProps = {
  searchParams: Promise<{
    theme?: string | string[];
    options?: string | string[];
    key?: string | string[];
  }>;
};

export default async function ProblemsPage({ searchParams }: ProblemsPageProps) {
  const t = await getTranslations("ProblemsWorkbook");
  const params = await searchParams;
  const themes = await getWorkbookThemes();
  const themeKey = resolveWorkbookThemeKey(themes, readSearchParam(params.theme));
  const problems = themeKey ? await getWorkbookProblems(themeKey) : [];
  const showOptions = readSearchParam(params.options) !== "0";
  const showKey = isQueryFlagOn(readSearchParam(params.key));

  if (!themeKey) {
    return (
      <PageFrame kicker={t("kicker")} title={t("title")} lead={t("empty")}>
        <></>
      </PageFrame>
    );
  }

  return (
    <ProblemsWorkbook
      themes={themes}
      themeKey={themeKey}
      problems={problems}
      showOptions={showOptions}
      showKey={showKey}
    />
  );
}
