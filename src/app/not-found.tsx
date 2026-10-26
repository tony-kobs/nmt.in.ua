import { getLocale, getTranslations } from "next-intl/server";
import { StatusScene } from "@/components/status/StatusScene";
import { createPageMetadata } from "@/constants/seo";
import { statusCopy } from "@/i18n/statusPages";

export async function generateMetadata() {
  const t = await getTranslations("Metadata.notFound");
  return createPageMetadata({
    title: t("title"),
    description: t("description"),
    path: "/",
    noIndex: true,
  });
}

export default async function NotFoundPage() {
  const locale = await getLocale();
  return <StatusScene variant="notFound" copy={statusCopy(locale)} />;
}
