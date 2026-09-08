"use client";

import { useTranslations } from "next-intl";
import type { RecentResultItem } from "@/modules/results/getRecentResults";
import css from "./RecentResults.module.css";

type RecentResultsProps = {
  items: RecentResultItem[];
};

export function RecentResults({ items }: RecentResultsProps) {
  const t = useTranslations("RecentResults");

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
              <span>{item.topic}</span>
              <strong>{item.score}%</strong>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
