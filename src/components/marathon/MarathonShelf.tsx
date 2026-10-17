import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageFrame } from "@/components/dashboard/PageFrame";
import { joinMarathonAction } from "@/modules/marathons/daily/actions";
import type { ShelfCard } from "@/modules/marathons/daily/shelf";
import css from "./marathon.module.css";

export async function MarathonShelf({ cards }: { cards: ShelfCard[] }) {
  const t = await getTranslations("Marathon");
  return (
    <PageFrame title={t("kicker")} lead={t("shelfLead")}>
      {cards.length === 0 ? (
        <p className={css.lead}>{t("shelfEmpty")}</p>
      ) : (
        <ul className={css.shelf}>
          {cards.map((card) => (
            <li key={card.slug}>
              <article className={css.shelfCard}>
                <p className={css.kicker}>{t(`status.${card.status}`)}</p>
                <h2 className={css.shelfTitle}>{card.title}</h2>
                {card.description ? (
                  <p className={css.lead}>{card.description}</p>
                ) : null}
                <p className={css.meta}>{t("cardDays", { count: card.daysCount })}</p>
                <div className={css.actions}>
                  {card.joined ? (
                    <Link href={card.href} className={css.button}>
                      {card.status === "finished" ? t("cardSummary") : t("cardAbout")}
                    </Link>
                  ) : (
                    <form action={joinMarathonAction}>
                      <input type="hidden" name="slug" value={card.slug} />
                      <button type="submit" className={css.button}>
                        {t("cardJoin")}
                      </button>
                    </form>
                  )}
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </PageFrame>
  );
}
