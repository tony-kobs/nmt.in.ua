import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PromoDesk } from "@/components/promo/PromoDesk/PromoDesk";
import { PageFrame } from "@/components/dashboard/PageFrame";
import { createPageMetadata } from "@/constants/seo";
import { requireUser } from "@/modules/auth/getCurrentUser";
import { isPlatformStaff } from "@/modules/auth/types";
import { listPromoCodes } from "@/modules/promo/store";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("Metadata.promo");
  return createPageMetadata({
    title: t("title"),
    description: t("description"),
    path: "/admin/promos",
    noIndex: true,
  });
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminPromosPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string | string[]; error?: string | string[] }>;
}) {
  const user = await requireUser();
  const role = user.realRole ?? user.role;
  if (!isPlatformStaff(role)) redirect("/");
  const query = await searchParams;
  const codes = await listPromoCodes({ actorId: user.id, actorRole: role });
  const t = await getTranslations("PromoAdmin");
  return (
    <PageFrame kicker={t("kicker")} title={t("title")} lead={t("lead")}>
      <PromoDesk
        mode="staff"
        codes={codes}
        saved={first(query.saved) === "1"}
        error={first(query.error) ?? null}
        exampleUrl={null}
      />
    </PageFrame>
  );
}
