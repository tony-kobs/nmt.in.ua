import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { joinMarathonAction } from "@/modules/marathons/daily/actions";
import type { HomeMarathonCard } from "@/modules/marathons/daily/homeCard";
import css from "./MarathonHomeCards.module.css";

export async function MarathonHomeCards({
  cards,
  signedIn,
  bleed = false,
}: {
  cards: HomeMarathonCard[];
  signedIn: boolean;
  /** Full-bleed landing section. The cabinet already sits in the page frame. */
  bleed?: boolean;
}) {
  if (cards.length === 0) return null;
  const t = await getTranslations("Marathon");
  const body = (
    <>
        <h2 id="home-marathons" className={css.title}>{t("homeTitle")}</h2>
        <ul className={css.list}>
          {cards.map((card) => (
            <li key={card.slug}>
              <article className={css.card}>
                <h3 className={css.cardTitle}>{card.title}</h3>
                {card.description ? <p className={css.description}>{card.description}</p> : null}
                <div className={css.actions}>
                  {card.action === "continue" ? (
                    <Link href={card.href} className={css.button}>{t("homeContinue")}</Link>
                  ) : signedIn ? (
                    <form action={joinMarathonAction}>
                      <input type="hidden" name="slug" value={card.slug} />
                      <button type="submit" className={css.button}>{t("homeJoin")}</button>
                    </form>
                  ) : (
                    <Link href={card.href} className={css.button}>{t("homeJoin")}</Link>
                  )}
                </div>
              </article>
            </li>
          ))}
        </ul>
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
