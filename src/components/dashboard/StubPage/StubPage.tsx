import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageFrame, PagePanel } from "@/components/dashboard/PageFrame";
import css from "./StubPage.module.css";

type StubPageProps = {
  title: string;
  description: string;
};

export async function StubPage({ title, description }: StubPageProps) {
  const t = await getTranslations("StubPage");

  return (
    <PageFrame kicker={t("kicker")} title={title} lead={description}>
      <PagePanel>
        <p className={css.note}>{t("developmentDescription")}</p>
      </PagePanel>

      <div className={css.ctaRow}>
        <Link href="/simulator" className={css.cta}>
          {t("goToSimulator")}
        </Link>
        <Link href="/materials/textbook" className={css.ctaSecondary}>
          {t("goToMaterials")}
        </Link>
        <Link href="/" className={css.ctaSecondary}>
          {t("goToTest")}
        </Link>
      </div>
    </PageFrame>
  );
}
