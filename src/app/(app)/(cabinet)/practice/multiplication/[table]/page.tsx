import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageFrame } from "@/components/dashboard/PageFrame";
import { isTable, type Table } from "@/components/practice/multiplication/constants";
import { MultiplicationTrainer } from "@/components/practice/multiplication/MultiplicationTrainer";
import { createPageMetadata } from "@/constants/seo";

type PageProps = { params: Promise<{ table: string }> };

function parseTable(raw: string): Table | null {
  const n = Number(raw);
  return Number.isInteger(n) && String(n) === raw && isTable(n) ? n : null;
}

export async function generateMetadata({ params }: PageProps) {
  const { table } = await params;
  const n = parseTable(table);
  const t = await getTranslations("PracticeMultiplication");
  return createPageMetadata({
    title: n ? t("trainerTitle", { n }) : t("title"),
    description: t("metaDescription"),
    path: `/practice/multiplication/${table}`,
    noIndex: true,
  });
}

export default async function MultiplicationTablePage({ params }: PageProps) {
  const { table } = await params;
  const n = parseTable(table);
  if (n === null) redirect("/practice/multiplication");

  const t = await getTranslations("PracticeMultiplication");

  return (
    <PageFrame kicker={t("kicker")} title={t("trainerTitle", { n })}>
      <MultiplicationTrainer table={n} />
    </PageFrame>
  );
}