"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { RecentResultItem } from "@/modules/results/getRecentResults";
import css from "./RecentResults.module.css";

type RecentResultsProps = {
  items: (Omit<RecentResultItem, "score"> & { score: number | null; startedAt?: number | null })[];
};

export function RecentResults({ items }: RecentResultsProps) {
  const t = useTranslations("RecentResults");
  const format = useFormatter();

  return (
    <section className={css.panel} aria-labelledby="recent-results-title">
      <h2 id="recent-results-title" className={css.title}>
        {t("title")}
      </h2>

      {items.length === 0 ? (
        <p className={css.hint}>{t("empty")}</p>
      ) : (
        <ul className={css.list}>
          {items.map((item) => (
            <li key={item.sessionId} className={css.item}>
              <span className={css.description}>
                <span>{item.topic}</span>
                {item.startedAt !== undefined ? (
                  item.startedAt === null ? <small>{t("unknownDate")}</small> :
                    <time dateTime={new Date(item.startedAt * 1000).toISOString()}>
                      {t("startedAt", { date: format.dateTime(new Date(item.startedAt * 1000), { dateStyle: "medium", timeZone: "Europe/Kyiv" }) })}
                    </time>
                ) : null}
              </span>
              <strong>{item.score === null ? "—" : `${item.score}%`}</strong>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
