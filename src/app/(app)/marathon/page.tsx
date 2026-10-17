import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { MarathonShelf } from "@/components/marathon/MarathonShelf";
import { createPageMetadata } from "@/constants/seo";
import { requireUser } from "@/modules/auth/getCurrentUser";
import { listStudentMarathonShelf } from "@/modules/marathons/daily/store";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("Marathon");
  return createPageMetadata({
    title: t("kicker"),
    description: t("shelfLead"),
    path: "/marathon",
    noIndex: true,
  });
}

export default async function MarathonShelfPage() {
  const user = await requireUser();
  if (user.role !== "student") {
    redirect(user.role === "teacher" ? "/assign" : "/");
  }
  const cards = await listStudentMarathonShelf(user.id);
  return <MarathonShelf cards={cards} />;
}
