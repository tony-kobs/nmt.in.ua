"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { PageFrame, PagePanel } from "@/components/dashboard/PageFrame";
import css from "./SessionExpiredNotice.module.css";

/**
 * Shown instead of the trainer whenever a session's fixed 24h deadline has
 * passed — either already expired when the page loads, or crossed while the
 * student was still on the page (see `useSessionTimer`/`useCountdownTimer`).
 * Read-only: results already recorded are unaffected and remain visible on
 * `/results` and `/sessions` — this only blocks further interaction with
 * this specific, now-inactive attempt.
 */
export function SessionExpiredNotice() {
  const t = useTranslations("SessionExpiredNotice");

  return (
    <PageFrame title={t("title")} lead={t("lead")}>
      <PagePanel>
        <p className={css.note}>{t("body")}</p>
        <Link href="/" className={css.cta}>
          {t("backToTopics")}
        </Link>
      </PagePanel>
    </PageFrame>
  );
}
