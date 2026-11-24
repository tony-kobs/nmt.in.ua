import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PromoDesk } from "@/components/promo/PromoDesk/PromoDesk";
import { PageFrame } from "@/components/dashboard/PageFrame";
import { createPageMetadata } from "@/constants/seo";
import { absoluteUrl } from "@/constants/seo";
import { requireUser } from "@/modules/auth/getCurrentUser";
import { isPlatformStaff } from "@/modules/auth/types";
import { listPromoCodes } from "@/modules/promo/store";
import { getOwnTeacherProfile } from "@/modules/teachers";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("Metadata.promo");
  return createPageMetadata({
    title: t("title"),
    description: t("description"),
    path: "/promo",
    noIndex: true,
  });
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function TeacherPromosPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string | string[]; error?: string | string[] }>;
}) {
  const user = await requireUser();
  const role = user.realRole ?? user.role;
  if (isPlatformStaff(role)) redirect("/admin/promos");
  if (role !== "teacher") redirect("/");
  const query = await searchParams;
  const codes = await listPromoCodes({ actorId: user.id, actorRole: role });
  let exampleUrl: string | null = null;
  try {
    const profile = await getOwnTeacherProfile(user.id);
    if (profile.slug) {
      exampleUrl = absoluteUrl(`/register?ref=${encodeURIComponent(profile.slug)}`);
    }
  } catch (error) {
    console.error("promo: teacher slug failed", error);
  }
  const t = await getTranslations("PromoAdmin");
  return (
    <PageFrame kicker={t("kicker")} title={t("title")} lead={t("leadTeacher")}>
      <PromoDesk
        mode="teacher"
        codes={codes}
        saved={first(query.saved) === "1"}
        error={first(query.error) ?? null}
        exampleUrl={exampleUrl}
      />
    </PageFrame>
  );
}
