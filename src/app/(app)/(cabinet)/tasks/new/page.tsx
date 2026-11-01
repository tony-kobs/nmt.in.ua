import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AdminTaskForm } from "@/components/admin/AdminTaskForm";
import { PageFrame } from "@/components/dashboard/PageFrame";
import { createPageMetadata } from "@/constants/seo";
import { getAdminThemes } from "@/modules/admin-content";
import { requireRole } from "@/modules/auth/getCurrentUser";
import { parseThemeQueryParam } from "@/modules/testing/parseThemeQueryParam";

type NewTaskPageProps = {
  searchParams: Promise<{ theme?: string | string[] }>;
};

export async function generateMetadata() {
  const t = await getTranslations("AdminContent");
  return createPageMetadata({
    title: t("createTitle"),
    description: t("createLead"),
    path: "/tasks/new",
  });
}

function readThemeParam(raw: string | string[] | undefined): string | undefined {
  if (Array.isArray(raw)) return raw[0];
  return raw;
}

export default async function NewAdminTaskPage({ searchParams }: NewTaskPageProps) {
  await requireRole(["admin"]);
  const t = await getTranslations("AdminContent");
  const themes = await getAdminThemes();
  if (themes.length === 0) {
    redirect("/");
  }

  const params = await searchParams;
  const fromQuery = parseThemeQueryParam(readThemeParam(params.theme));
  const themeId =
    fromQuery && themes.some((theme) => theme.id === fromQuery)
      ? fromQuery
      : themes[0]!.id;

  return (
    <PageFrame kicker={t("kicker")} title={t("createTitle")} lead={t("createLead")}>
      <AdminTaskForm
        key={`create-${themeId}`}
        mode="create"
        themes={themes}
        themeId={themeId}
        backHref={`/?theme=${themeId}`}
      />
    </PageFrame>
  );
}
