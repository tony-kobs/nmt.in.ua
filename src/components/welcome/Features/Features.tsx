import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { Reveal } from "@/components/ui/Reveal";
import landing from "../landing.module.css";
import css from "./Features.module.css";

/** Clockwise from 12, so the dial reads like a clock around the mascot. */
const FEATURES = [
  ["marathon", "h12"],
  ["topics", "h2"],
  ["simulator", "h4"],
  ["results", "h6"],
  ["sessions", "h8"],
  ["recommendations", "h10"],
] as const;

export async function Features() {
  const t = await getTranslations("WelcomeLanding.features");

  return (
    <section
      id="features"
      className={`${landing.section} ${css.section}`}
      aria-labelledby="features-title"
    >
      <div className={landing.container}>
        <Reveal className={css.head}>
          <h2 id="features-title" className={landing.sectionTitle}>
            {t.rich("title", {
              accent: (chunks) => (
                <span className={css.titleAccent}>{chunks}</span>
              ),
            })}
          </h2>
          <p className={landing.sectionLead}>{t("lead")}</p>
        </Reveal>

        <Reveal className={css.stage}>
          <div className={css.layout}>
            <div className={css.studentWrap}>
              <Image
                className={css.student}
                src="/landing/features-mascot.webp"
                alt={t("imageAlt")}
                width={578}
                height={578}
                sizes="(min-width: 1440px) 18rem, (min-width: 1240px) 16rem, 14rem"
              />
            </div>

            <ul className={css.stickers}>
              {FEATURES.map(([key, slot]) => (
                <li key={key} className={`${css.sticker} ${css[key]} ${css[slot]}`}>
                  <h3 className={css.stickerTitle}>{t(`items.${key}.title`)}</h3>
                  <p className={css.stickerText}>{t(`items.${key}.text`)}</p>
                </li>
              ))}
            </ul>

            <div className={css.decos} aria-hidden>
              <span className={`${css.deco} ${css.bookS} ${css.closedBook}`}>
                <span className={css.closedPages} />
                <span className={css.closedCover} />
              </span>
              <span className={`${css.deco} ${css.pencilH} ${css.pencil}`} />
              <span className={`${css.deco} ${css.penS} ${css.pen}`} />
              <span className={`${css.deco} ${css.rulerV} ${css.ruler}`} />
              <span className={`${css.deco} ${css.penL} ${css.pen}`} />
              <span
                className={`${css.deco} ${css.bookM} ${css.closedBook} ${css.closedWarm}`}
              >
                <span className={css.closedPages} />
                <span className={css.closedCover} />
              </span>
              <span className={`${css.deco} ${css.compassSlot} ${css.compass}`}>
                <span className={css.compassLeg} />
                <span className={css.compassLegAlt} />
                <span className={css.compassKnob} />
              </span>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
