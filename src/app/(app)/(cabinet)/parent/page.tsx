import { getTranslations } from "next-intl/server";
import { PageFrame } from "@/components/dashboard/PageFrame";
import { createPageMetadata } from "@/constants/seo";

export async function generateMetadata() {
  const t = await getTranslations("ParentDashboard");

  return createPageMetadata({
    title: t("title"),
    description: t("placeholder"),
    path: "/parent",
    noIndex: true,
  });
}

export default async function ParentPage() {
  const t = await getTranslations("ParentDashboard");

  return (
    <PageFrame title={t("title")} lead={t("placeholder")}>
      {null}
    </PageFrame>
  );
}
