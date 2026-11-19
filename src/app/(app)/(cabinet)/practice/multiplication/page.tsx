import { getTranslations } from "next-intl/server";
import { PageFrame } from "@/components/dashboard/PageFrame";
import { MultiplicationTables } from "@/components/practice/multiplication/MultiplicationTables";
import { createPageMetadata } from "@/constants/seo";

export async function generateMetadata() {
  const t = await getTranslations("PracticeMultiplication");
  return createPageMetadata({
    title: t("metaTitle"),
    description: t("metaDescription"),
    path: "/practice/multiplication",
    noIndex: true,
  });
}

export default async function MultiplicationPage() {
  const t = await getTranslations("PracticeMultiplication");

  return (
    <PageFrame kicker={t("kicker")} title={t("title")} lead={t("lead")}>
      <MultiplicationTables />
    </PageFrame>
  );
}