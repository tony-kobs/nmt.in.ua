import { getTranslations } from "next-intl/server";
import { createPageMetadata } from "@/constants/seo";
import { JoinScreen } from "./JoinScreen";

export async function generateMetadata() {
  const t = await getTranslations("Metadata.join");

  return createPageMetadata({
    title: t("title"),
    description: t("description"),
    path: "/join",
    noIndex: true,
  });
}

export default function JoinPage() {
  return <JoinScreen />;
}
