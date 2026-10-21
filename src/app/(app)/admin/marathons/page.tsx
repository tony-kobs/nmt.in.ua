import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { MarathonAdminList } from "@/components/marathon/MarathonAdmin";
import { createPageMetadata } from "@/constants/seo";
import { requireUser } from "@/modules/auth/getCurrentUser";
import { hasPermission } from "@/modules/auth/permissions";
import { loadMarathonCardStats } from "@/modules/marathons/daily/cardStats";
import { listDailyMarathons } from "@/modules/marathons/daily/store";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("Metadata.marathonAdmin");
  return createPageMetadata({
    title: t("title"),
    description: t("description"),
    path: "/admin/marathons",
    noIndex: true,
  });
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminMarathonsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[]; saved?: string | string[] }>;
}) {
  const user = await requireUser();
  if (!hasPermission(user.role, "marathon:manage")) redirect("/");
  const query = await searchParams;
  const marathons = await listDailyMarathons();
  const stats = await loadMarathonCardStats(marathons);
  return (
    <MarathonAdminList
      marathons={marathons}
      stats={stats}
      error={first(query.error)}
      savedToken={first(query.saved)}
    />
  );
}
