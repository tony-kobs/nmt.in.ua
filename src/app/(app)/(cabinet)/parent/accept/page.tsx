import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";
import { PageFrame, PagePanel } from "@/components/dashboard/PageFrame";
import { ParentAcceptForm } from "@/components/dashboard/ParentDashboard/ParentAcceptForm";
import css from "@/components/dashboard/ParentDashboard/ParentAcceptForm.module.css";
import { createPageMetadata } from "@/constants/seo";
import { optionalLiveUser } from "@/modules/auth/getCurrentUser";
import { getParentInvite } from "@/modules/parent-students/getParentInvite";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("ParentDashboard");
  return createPageMetadata({
    title: t("acceptTitle"),
    description: t("acceptLead"),
    path: "/parent/accept",
    noIndex: true,
  });
}

type Props = { searchParams: Promise<{ token?: string | string[] }> };

export default async function ParentAcceptPage({ searchParams }: Props) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  const user = await optionalLiveUser();
  if (!user) {
    const next = token ? `/parent/accept?token=${encodeURIComponent(token)}` : "/parent";
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  const t = await getTranslations("ParentDashboard");
  const invitation = token ? await getParentInvite(token) : { valid: false as const };

  return (
    <PageFrame title={t("acceptTitle")} lead={t("acceptLead")}>
      <PagePanel>
        {user.role !== "parent" ? (
          <p role="status">{t("acceptWrongRole")}</p>
        ) : invitation.valid ? (
          <ParentAcceptForm token={token} childName={invitation.childName} />
        ) : (
          <>
            <p role="status">{t("acceptInvalid")}</p>
            <p><Link className={css.submit} href="/parent">{t("backToCabinet")}</Link></p>
          </>
        )}
      </PagePanel>
    </PageFrame>
  );
}
