import Link from "next/link";
import clsx from "clsx";
import { getTranslations } from "next-intl/server";
import { AuthShell } from "@/components/auth/AuthShell";
import { createPageMetadata } from "@/constants/seo";
import { cancelDeletionByToken } from "@/modules/admin-profiles/accountDeletion";
import css from "@/components/auth/auth.module.css";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getTranslations("Metadata.keepAccount");
  return createPageMetadata({
    title: t("title"),
    description: t("description"),
    path: "/keep-account",
    noIndex: true,
  });
}

type KeepAccountPageProps = {
  searchParams: Promise<{ token?: string | string[] }>;
};

export default async function KeepAccountPage({ searchParams }: KeepAccountPageProps) {
  const params = await searchParams;
  const raw = Array.isArray(params.token) ? params.token[0] : params.token;
  const { getConnection } = await import("@/lib/db/mysql");
  const result = await cancelDeletionByToken(raw ?? "", { getConnection });
  const t = await getTranslations("KeepAccount");
  const kept = result === "kept";

  return (
    <AuthShell>
      <div className={css.card}>
        <header className={css.intro}>
          <p className={css.kicker}>{t("kicker")}</p>
          <h1 className={css.title}>{kept ? t("title") : t("invalidTitle")}</h1>
          <p className={clsx(css.alert, kept && css.alertSuccess)} role="status">
            {kept ? t("success") : t("invalid")}
          </p>
        </header>
        <div className={css.actions}>
          <Link href="/login" className={css.submit}>
            {t("goToLogin")}
          </Link>
        </div>
      </div>
    </AuthShell>
  );
}
