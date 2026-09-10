import { getTranslations } from "next-intl/server";
import { requireSessionUserId } from "@/modules/auth/getCurrentUser";
import { createPageMetadata } from "@/constants/seo";
import { getNmtVariantsForUser } from "@/modules/testing/getNmtVariants";
import { SimulatorStart } from "@/components/testing/SimulatorStart";
import css from "./page.module.css";

export async function generateMetadata() {
  const t = await getTranslations("Metadata.simulator");
  return createPageMetadata({
    title: t("title"),
    description: t("description"),
    path: "/simulator",
    noIndex: true,
  });
}

export default async function SimulatorPage() {
  const userId = await requireSessionUserId();
  const variants = await getNmtVariantsForUser(userId);
  const t = await getTranslations("simulator");

  return (
    <section className={css.page} aria-labelledby="simulator-title">
      <header className={css.intro}>
        <p className={css.eyebrow}>{t("eyebrow")}</p>
        <h1 id="simulator-title" className={css.title}>
          {t("title")}
        </h1>
        <p className={css.description}>{t("description")}</p>
      </header>

      <SimulatorStart variants={variants} />
    </section>
  );
}
