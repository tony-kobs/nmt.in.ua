import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth/AuthShell";
import { ParentRegisterForm } from "@/components/auth/ParentRegisterForm/ParentRegisterForm";
import { createPageMetadata } from "@/constants/seo";
import { getParentInvite } from "@/modules/parent-students/getParentInvite";
import css from "@/components/auth/auth.module.css";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("ParentRegister");
  return {
    ...createPageMetadata({ title: t("title"), description: t("lead"), path: "/register/parent", noIndex: true }),
    referrer: "no-referrer" as const,
  };
}

type Props = { searchParams: Promise<{ token?: string | string[] }> };

export default async function ParentRegisterPage({ searchParams }: Props) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : "";
  const [invitation, t] = await Promise.all([getParentInvite(token), getTranslations("ParentRegister")]);

  return (
    <AuthShell aside={{ badge: t("asideBadge"), title: t("asideTitle"), lead: t("asideLead") }}>
      <div className={css.card}>
        {invitation.valid ? <ParentRegisterForm token={token} /> : (
          <>
            <header className={css.intro}>
              <h1 className={css.title}>{t("invalidTitle")}</h1>
              <p className={css.lead}>{t("invalidMessage")}</p>
            </header>
            <p className={css.switch}>
              <Link className={css.switchLink} href="/login">{t("signIn")}</Link>
            </p>
          </>
        )}
      </div>
    </AuthShell>
  );
}
