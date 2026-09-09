import { getTranslations } from "next-intl/server";
import type { ComponentType, SVGProps } from "react";
import { Reveal } from "@/components/ui/Reveal";
import {
  BookIcon,
  ChartIcon,
  CompassIcon,
  ExamIcon,
  TopicsIcon,
  UsersIcon,
} from "../icons";
import css from "../landing.module.css";

type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

const FEATURES: ReadonlyArray<{ key: string; Icon: IconComponent }> = [
  { key: "topics", Icon: TopicsIcon },
  { key: "simulator", Icon: ExamIcon },
  { key: "materials", Icon: BookIcon },
  { key: "results", Icon: ChartIcon },
  { key: "recommendations", Icon: CompassIcon },
  { key: "sessions", Icon: UsersIcon },
];

export async function Features() {
  const t = await getTranslations("WelcomeLanding.features");

  return (
    <section id="features" className={css.section} aria-labelledby="features-title">
      <div className={css.container}>
        <Reveal className={css.sectionHead}>
          <p className={css.kicker}>{t("kicker")}</p>
          <h2 id="features-title" className={css.sectionTitle}>
            {t("title")}
          </h2>
          <p className={css.sectionLead}>{t("lead")}</p>
        </Reveal>

        <ul className={`${css.grid} ${css.gridThree}`}>
          {FEATURES.map(({ key, Icon }, index) => (
            <Reveal as="li" key={key} delay={index * 70}>
              <article className={css.card}>
                <span className={css.cardIcon} aria-hidden>
                  <Icon size={22} />
                </span>
                <h3 className={css.cardTitle}>{t(`items.${key}.title`)}</h3>
                <p className={css.cardText}>{t(`items.${key}.text`)}</p>
              </article>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
