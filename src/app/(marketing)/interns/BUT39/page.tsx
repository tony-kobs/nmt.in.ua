import { getTranslations } from "next-intl/server";
import { LandingHeader } from "@/components/welcome/LandingHeader/LandingHeader";
import { LandingFooter } from "@/components/welcome/LandingFooter/LandingFooter";
import landing from "@/components/welcome/landing.module.css";
import MyCard from "./MyCard";
import styles from "./page.module.css";

export default async function InternPage() {
  const t = await getTranslations("MyCard");

  return (
    <div className={`${landing.page} ${styles.page}`}>
      <LandingHeader />
      <main className={styles.main}>
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
