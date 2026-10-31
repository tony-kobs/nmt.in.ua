import { getTranslations } from "next-intl/server";
import { PageFrame } from "@/components/dashboard/PageFrame";
import { ContentImportForm } from "@/components/settings/ContentImportForm";
import { getNavItem } from "@/constants/navigation";
import { createPageMetadata } from "@/constants/seo";
import { isContentImportConfigured } from "@/modules/content-import/auth";
import { requireRole } from "@/modules/auth/getCurrentUser";

const item = getNavItem("/settings");

export async function generateMetadata() {
  const t = await getTranslations("Metadata.settings");

  return createPageMetadata({
    title: t("title"),
    description: t("description"),
    path: item.href,
  });
}

export default async function SettingsPage() {
  await requireRole(["admin"]);

  const t = await getTranslations("SettingsPage");
  const importEnabled = isContentImportConfigured();

  return (
    <PageFrame title={t("title")} lead={t("description")}>
      <ContentImportForm importEnabled={importEnabled} />
    </PageFrame>
  );
}
