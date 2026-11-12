import { getTranslations } from "next-intl/server";
import { LandingHeader } from "@/components/welcome/LandingHeader/LandingHeader";
import { LandingFooter } from "@/components/welcome/LandingFooter/LandingFooter";
import landing from "@/components/welcome/landing.module.css";
import InternCard from "./InternCard";
import styles from "./page.module.css";

export default async function InternPage() {
  const t = await getTranslations("InternMyPage");

  return (
    <div className={`${landing.page} ${styles.page}`}>
      <LandingHeader />
    <main className={styles.main}>
      <InternCard
        name={t("name")}
        taskDescription={t("task1")}
        codeLabel={t("codeLink")}
        liveLabel={t("liveLink")}
        codeUrl="https://github.com/sasha-dubrovina28/math-trainer"
        liveUrl="https://math-trainer-phi.vercel.app/"
      />
      </main>
      <LandingFooter/>
    </div>
  );
}
