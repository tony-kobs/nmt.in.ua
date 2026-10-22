import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { JsonLd } from "@/components/seo";
import { Reveal } from "@/components/ui/Reveal";
import { PlusIcon } from "../icons";
import landing from "../landing.module.css";
import css from "./Faq.module.css";

const FAQ_KEYS = ["price", "who", "mobile", "recommendations", "teacher"] as const;

export async function Faq() {
  const t = await getTranslations("WelcomeLanding.faq");

  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ_KEYS.map((key) => ({
      "@type": "Question",
      name: t(`items.${key}.q`),
      acceptedAnswer: { "@type": "Answer", text: t(`items.${key}.a`) },
    })),
  };

  return (
    <section id="faq" className={landing.section} aria-labelledby="faq-title">
      <JsonLd data={faqJsonLd} />
      <div className={landing.container}>
        <div className={css.split}>
          <Reveal className={css.visual}>
            <Image
              className={css.photo}
              src="/landing/faq-student.jpg"
              alt={t("imageAlt")}
              width={900}
              height={1200}
              sizes="(min-width: 1240px) 28rem, (min-width: 768px) 40vw, 85vw"
              priority={false}
            />
          </Reveal>

          <div className={css.content}>
            <Reveal className={css.head}>
              <h2 id="faq-title" className={landing.sectionTitle}>
                {t("title")}
              </h2>
              <p className={landing.sectionLead}>{t("lead")}</p>
            </Reveal>

            <div className={css.list}>
              {FAQ_KEYS.map((key, index) => (
                <Reveal key={key} delay={index * 60}>
                  <details className={landing.faqItem}>
                    <summary className={landing.faqSummary}>
                      {t(`items.${key}.q`)}
                      <PlusIcon size={20} className={landing.faqIcon} />
                    </summary>
                    <p className={landing.faqAnswer}>{t(`items.${key}.a`)}</p>
                  </details>
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
