import { getTranslations } from "next-intl/server";
import { LandingFooter } from "@/components/welcome/LandingFooter/LandingFooter";
import { LandingHeader } from "@/components/welcome/LandingHeader/LandingHeader";
import landing from "@/components/welcome/landing.module.css";
import { SkipLink } from "@/components/ui/SkipLink";
import { createPageMetadata } from "@/constants/seo";
import MyCard from "./MyCard";
import styles from "./page.module.css";

export async function generateMetadata() {
  const t = await getTranslations("Metadata.internBut39");
  return createPageMetadata({
    title: t("title"),
    description: t("description"),
    path: "/interns/BUT39",
  });
}

export default async function InternPage() {
  const t = await getTranslations("MyCard");
  const common = await getTranslations("Common");

  return (
    <div className={`${landing.page} ${styles.page}`}>
      <SkipLink label={common("skipToContent")} />
      <LandingHeader />
      <main id="main-content" className={styles.main} tabIndex={-1}>
        <MyCard
          name={t("name")}
          taskDescription={t("task1")}
          codeLabel={t("codeLink")}
          liveLabel={t("liveLink")}
          codeUrl="https://github.com/BUT39/division-calculator2"
          liveUrl="https://division-calculator2.vercel.app"
        />
      </main>
      <LandingFooter />
    </div>
  );
}
