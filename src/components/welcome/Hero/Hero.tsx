import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Reveal } from "@/components/ui/Reveal";
import { DiagnosticPageTurnLink } from "@/components/welcome/DiagnosticPageTurnLink";
import { ArrowRightIcon, CheckIcon, TimerIcon, TrendIcon } from "../icons";
import css from "../landing.module.css";

const STAT_KEYS = ["topics", "modes", "format"] as const;

export async function Hero() {
  const t = await getTranslations("WelcomeLanding.hero");

  return (
    <section className={css.hero} aria-labelledby="hero-title">
      <div className={`${css.container} ${css.heroGrid}`}>
        <Reveal className={css.heroCopy}>
          <p className={css.heroBadge}>
            <span className={css.heroBadgeDot} aria-hidden />
            {t("badge")}
          </p>

          <h1 id="hero-title" className={css.heroTitle}>
            {t("titleStart")} <span className={css.accent}>{t("titleAccent")}</span>
          </h1>

          <p className={css.heroLead}>{t("lead")}</p>

          <div className={css.heroActions}>
            <Link href="/register" className={`${css.btn} ${css.btnPrimary}`}>
              {t("ctaPrimary")}
              <ArrowRightIcon size={18} />
            </Link>
            <Link href="/login" className={`${css.btn} ${css.btnGhost}`}>
              {t("ctaSecondary")}
            </Link>
            <DiagnosticPageTurnLink href="/diagnostic" className={`${css.btn} ${css.btnGhost}`}>
              {t("ctaDiagnostic")}
            </DiagnosticPageTurnLink>
          </div>

          <p className={css.heroNote}>
            <CheckIcon size={16} className={css.heroNoteIcon} />
            {t("note")}
          </p>

          <dl className={css.heroStats}>
            {STAT_KEYS.map((key) => (
              <div key={key}>
                <dt className={css.heroStatValue}>{t(`stats.${key}.value`)}</dt>
                <dd className={css.heroStatLabel}>{t(`stats.${key}.label`)}</dd>
              </div>
            ))}
          </dl>
        </Reveal>

        <Reveal className={css.heroVisual} delay={140}>
          <div className={css.heroFrame}>
            <Image
              src="/landing/hero-paper.webp"
              alt={t("imageAlt")}
              width={1024}
              height={1024}
              className={css.heroImage}
              sizes="(min-width: 1240px) 38rem, (min-width: 768px) 30rem, 100vw"
              priority
            />
          </div>

          <div className={`${css.heroChip} ${css.heroChipA}`}>
            <span className={css.heroChipIcon} aria-hidden>
              <TrendIcon size={16} />
            </span>
            <span>
              <span className={css.heroChipTitle}>{t("chipA.title")}</span>
              <span className={css.heroChipText}>{t("chipA.text")}</span>
            </span>
          </div>

          <div className={`${css.heroChip} ${css.heroChipB}`}>
            <span className={css.heroChipIcon} aria-hidden>
              <TimerIcon size={16} />
            </span>
            <span>
              <span className={css.heroChipTitle}>{t("chipB.title")}</span>
              <span className={css.heroChipText}>{t("chipB.text")}</span>
            </span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
