"use client";

import { useTranslations } from "next-intl";
import css from "./DiagnosticInfoPanel.module.css";

const ITEM_KEYS = ["tasks", "duration", "insight", "recommendations"] as const;

/**
 * Compact "what you get" list under the self-score card on `/diagnostic`.
 * Purely informational — no link or button here, so it never competes with
 * the panel's own "start" CTA above it.
 */
export function DiagnosticInfoPanel() {
  const t = useTranslations("Diagnostic.info");

  return (
    <section className={css.panel} aria-labelledby="diagnostic-info-title">
      <h2 id="diagnostic-info-title" className={css.title}>
        {t("title")}
      </h2>
      <ul className={css.list}>
        {ITEM_KEYS.map((key) => (
          <li key={key} className={css.item}>
            <svg
              className={css.icon}
              aria-hidden="true"
              viewBox="0 0 20 20"
              width="18"
              height="18"
              fill="none"
            >
              <path
                d="M4 10.5 8 14.5 16 6"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>{t(`items.${key}`)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
