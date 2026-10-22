import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Reveal } from "@/components/ui/Reveal";
import { ArrowRightIcon } from "../icons";
import css from "../landing.module.css";

export async function CtaBanner() {
  const t = await getTranslations("WelcomeLanding.cta");

  return (
    <section className={css.ctaSection} aria-labelledby="cta-title">
      <div className={css.container}>
        <Reveal>
          <div className={css.ctaBanner}>
            <span className={css.ctaGlow} aria-hidden />
            <span className={css.ctaPattern} aria-hidden>
              <span className={`${css.ctaMark} ${css.ctaMarkX}`}>x²</span>
              <span className={`${css.ctaMark} ${css.ctaMarkPi}`}>π r²</span>
              <span className={`${css.ctaMark} ${css.ctaMarkInt}`}>∫ f(x) dx</span>
              <svg className={css.ctaMarkTri} viewBox="0 0 48 40">
                <path
                  d="M6 34h36V6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </svg>
            </span>

            <h2 id="cta-title" className={css.ctaTitle}>
              {t("title")}
            </h2>
            <p className={css.ctaLead}>{t("lead")}</p>

            <div className={css.ctaActions}>
              <Link href="/register" className={`${css.btn} ${css.btnLight}`}>
                {t("primary")}
                <ArrowRightIcon size={18} />
              </Link>
              <Link href="/login" className={`${css.btn} ${css.btnOutlineLight}`}>
                {t("secondary")}
              </Link>
            </div>

            <p className={css.ctaNote}>{t("note")}</p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
