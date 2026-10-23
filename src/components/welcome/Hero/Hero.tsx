import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Reveal } from "@/components/ui/Reveal";
import { ArrowRightIcon } from "../icons";
import css from "../landing.module.css";

const STEP_KEYS = ["diagnose", "signup", "train", "track"] as const;
const DEMO_OPTIONS = ["optionA", "optionB", "optionC", "optionD"] as const;

export async function Hero() {
  const t = await getTranslations("WelcomeLanding.hero");
  const steps = await getTranslations("WelcomeLanding.steps");

  return (
    <section className={css.hero} aria-labelledby="hero-title">
      <div className={`${css.container} ${css.heroGrid}`}>
        <Reveal className={css.heroCopy}>
          <h1 id="hero-title" className={css.heroTitle}>
            {t("titleStart")}{" "}
            <span className={css.accent}>{t("titleAccent")}</span>{" "}
            {t("titleEnd")}
          </h1>

          <p className={css.heroLead}>{t("lead")}</p>

          <div className={css.heroCtaBlock}>
            <ol
              id="steps"
              className={css.heroSteps}
              aria-label={steps("kicker")}
            >
              {STEP_KEYS.map((key, index) => (
                <li key={key} className={css.heroStep}>
                  <span className={css.heroStepNum} aria-hidden>
                    {index + 1}
                  </span>
                  <div className={css.heroStepCopy}>
                    <p className={css.heroStepTitle}>
                      {steps(`items.${key}.title`)}
                    </p>
                    <p className={css.heroStepText}>
                      {steps(`items.${key}.text`)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>

            <div className={css.heroActions}>
              {/* Recommended first step: the guest diagnostic needs no account. */}
              <div className={css.heroPathPrimary}>
                <p className={css.heroPathPrompt}>{t("diagnosticPrompt")}</p>
                <div className={css.heroPathRow}>
                  <Link
                    href="/diagnostic"
                    className={`${css.btn} ${css.btnPrimary}`}
                  >
                    {t("ctaDiagnostic")}
                    <ArrowRightIcon size={18} />
                  </Link>
                  <p className={css.heroPathText}>{t("diagnosticHint")}</p>
                </div>
              </div>
            </div>
          </div>
        </Reveal>

        <Reveal className={css.heroVisual} delay={140}>
          <div className={css.heroStack}>
            <div className={`${css.heroStackSheet} ${css.heroStackSheetA}`} aria-hidden>
              <p className={css.heroStackLabel}>
                <DemoDots />
                {t("demo.backA")}
              </p>
            </div>
            <div className={`${css.heroStackSheet} ${css.heroStackSheetB}`} aria-hidden>
              <p className={css.heroStackLabel}>
                <DemoDots />
                {t("demo.backB")}
              </p>
            </div>

            <div className={css.heroDemo}>
              <div className={css.heroDemoHead}>
                <p className={css.heroDemoName}>
                  <DemoDots />
                  {t("demo.kicker")}
                </p>
                <p className={css.heroDemoMeta}>{t("demo.meta")}</p>
              </div>

              <p className={css.heroDemoTopic}>{t("demo.topic")}</p>

              <div className={css.heroDemoPrompt}>
                <p>{t("demo.prompt")}</p>
                <p className={css.heroDemoExpr}>
                  log<sub>2</sub> 16 + log<sub>3</sub> 27
                </p>
              </div>

              <ul className={css.heroDemoOptions}>
                {DEMO_OPTIONS.map((key) => (
                  <li key={key}>{t(`demo.${key}`)}</li>
                ))}
              </ul>

              <div className={css.heroDemoFoot}>
                <p className={css.heroDemoHint}>
                  <HintIcon />
                  <span>
                    log<sub>2</sub> 16 = 4, log<sub>3</sub> 27 = 3
                  </span>
                </p>
                <p className={css.heroDemoAnswer}>4 + 3 = 7</p>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function DemoDots() {
  return (
    <span className={css.heroDemoDots} aria-hidden>
      <span className={css.heroDemoDotRose} />
      <span className={css.heroDemoDotAmber} />
    </span>
  );
}

function HintIcon() {
  return (
    <svg
      className={css.heroDemoHintIcon}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      <path d="M9 18h6M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.4 10.9c.3.3.5.8.5 1.3V16h5.8v-.8c0-.5.2-1 .5-1.3A6 6 0 0 0 12 3z" />
    </svg>
  );
}
