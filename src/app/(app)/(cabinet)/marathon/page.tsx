import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { MarathonShelf } from "@/components/marathon/MarathonShelf";
import { createPageMetadata } from "@/constants/seo";
import { readSearchParam } from "@/lib/queryHref";
import { requireUser } from "@/modules/auth/getCurrentUser";
import { listStudentMarathonShelf } from "@/modules/marathons/daily/store";
import { getMarathonLeaderboard } from "@/modules/marathons";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ marathon?: string | string[] }>;
};

export async function generateMetadata() {
  const t = await getTranslations("Marathon");
  return createPageMetadata({
    title: t("kicker"),
    description: t("shelfLead"),
    path: "/marathon",
    noIndex: true,
  });
}

export default async function MarathonShelfPage({ searchParams }: PageProps) {
  const user = await requireUser();
  if (user.role !== "student") {
    redirect(user.role === "teacher" ? "/assign" : "/");
  }
  const marathonSlug = readSearchParam((await searchParams).marathon);
  const [cards, leaderboard] = await Promise.all([
    listStudentMarathonShelf(user.id),
    getMarathonLeaderboard(user.id, { marathonSlug }),
  ]);
  return <MarathonShelf cards={cards} leaderboard={leaderboard} />;
}
