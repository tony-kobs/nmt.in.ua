import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { joinMarathonAction } from "@/modules/marathons/daily/actions";
import type { HomeMarathonCard, HomeMarathonSpotlight } from "@/modules/marathons/daily/homeCard";
import { LeaderboardScroll } from "./LeaderboardScroll";
import css from "./MarathonHomeCards.module.css";

const PLACEHOLDER = "/landing/marathon-placeholder.webp";

export async function MarathonHomeCards({
  cards,
  spotlight,
  signedIn,
  bleed = false,
}: {
  cards: HomeMarathonCard[];
  spotlight: HomeMarathonSpotlight | null;
  signedIn: boolean;
  /** Full-bleed landing section. The cabinet already sits in the page frame. */
  bleed?: boolean;
}) {
  if (cards.length === 0 || !spotlight) return null;
  const t = await getTranslations("Marathon");
  const cover = spotlight.imageUrl || PLACEHOLDER;
  const body = (
    <>
      <div className={css.intro}>
        <h2 id="home-marathons" className={css.title}>{t("homeTitle")}</h2>
        <p className={css.lead}>{t("homeLead")}</p>
      </div>
      <div className={css.wood}>
        <div className={css.slate}>
          <div className={css.panels}>
            <article className={css.panel} aria-labelledby="home-marathon-current">
              <p className={css.kicker}>{t("homeMarathon")}</p>
              <h3 id="home-marathon-current" className={css.marathonTitle}>{spotlight.title}</h3>
              {spotlight.description ? (
                <p className={css.marathonText}>{spotlight.description}</p>
              ) : null}
              <div className={css.coverFrame}>
                <Image
                  src={cover}
                  alt={spotlight.imageUrl ? spotlight.title : ""}
                  width={1152}
                  height={864}
                  sizes="(min-width: 1240px) 520px, (min-width: 768px) 46vw, 100vw"
                  className={css.cover}
                />
              </div>
              <p className={css.day}>
                {t("homeDay", { current: spotlight.dayNumber, total: spotlight.daysCount })}
              </p>
              <div className={css.actions}>
                {spotlight.action === "continue" ? (
                  <Link href={spotlight.href} className={css.button}>{t("homeContinue")}</Link>
                ) : signedIn ? (
                  <form action={joinMarathonAction}>
                    <input type="hidden" name="slug" value={spotlight.slug} />
                    <button type="submit" className={css.button}>{t("homeJoin")}</button>
                  </form>
                ) : (
                  <Link href={spotlight.href} className={css.button}>{t("homeJoin")}</Link>
                )}
              </div>
            </article>
            <section className={`${css.panel} ${css.boardPanel}`} aria-labelledby="home-marathon-board">
              <h3 id="home-marathon-board" className={css.kicker}>{t("homeBoard")}</h3>
              {spotlight.board.length === 0 ? (
                <p className={css.empty}>{t("boardEmpty")}</p>
              ) : (
                <LeaderboardScroll>
                  {spotlight.board.map((row) => (
                    <li key={row.userId} className={css.boardRow}>
                      <span className={css.place}>{row.place}</span>
                      <span className={css.name}>{row.name}</span>
                      <span className={css.points}>{t("boardPoints", { count: row.points })}</span>
                    </li>
                  ))}
                </LeaderboardScroll>
              )}
            </section>
          </div>
        </div>
      </div>
    </>
  );
  if (!bleed) {
    return (
      <section className={css.inset} aria-labelledby="home-marathons">
        {body}
      </section>
    );
  }
  return (
    <section className={css.section} aria-labelledby="home-marathons">
      <div className={css.frame}>{body}</div>
    </section>
  );
}
