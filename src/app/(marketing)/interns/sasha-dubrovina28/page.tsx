import { getTranslations } from "next-intl/server";
import { LandingHeader } from "@/components/welcome/LandingHeader/LandingHeader";
import { LandingFooter } from "@/components/welcome/LandingFooter/LandingFooter";
import { JsonLd } from "@/components/seo";
import { PublicBreadcrumbs } from "@/components/seo/PublicBreadcrumbs";
import { buildTeacherProfileJsonLd, createPageMetadata } from "@/constants/seo";
import landing from "@/components/welcome/landing.module.css";
import InternCard from "./InternCard";
import styles from "./page.module.css";

export async function generateMetadata() {
  const t = await getTranslations("Metadata.intern");
  return createPageMetadata({
    title: t("title"),
    description: t("description"),
    path: "/interns/sasha-dubrovina28",
  });
}

export default async function InternPage() {
  const t = await getTranslations("InternMyPage");
  const seo = await getTranslations("Seo");
  const path = "/interns/sasha-dubrovina28";

  return (
    <div className={`${landing.page} ${styles.page}`}>
      <LandingHeader />
    <main className={styles.main}>
      <PublicBreadcrumbs
        label={seo("breadcrumb")}
        items={[
          { name: seo("home"), path: "/" },
          { name: t("name"), path },
        ]}
      />
      <JsonLd
        data={buildTeacherProfileJsonLd({
          name: t("name"),
          path,
          description: t("task1"),
          worksFor: false,
        })}
      />
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
