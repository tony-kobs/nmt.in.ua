import { getTranslations } from "next-intl/server";
import { WelcomeLanding } from "@/components/welcome/WelcomeLanding";
import { createPageMetadata } from "@/constants/seo";

export async function generateMetadata() {
  const t = await getTranslations("Metadata.welcome");
  return createPageMetadata({
    title: t("title"),
    description: t("description"),
    path: "/welcome",
  });
}

export default function WelcomePage() {
  return <WelcomeLanding />;
}
