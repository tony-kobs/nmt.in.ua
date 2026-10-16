import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { PagePanel } from "@/components/dashboard/PageFrame";
import { queryHref } from "@/lib/queryHref";
import type { SiteFeedbackPage } from "@/modules/feedback/types";
import css from "./FeedbackAdminList.module.css";

type FeedbackAdminListProps = {
  page: SiteFeedbackPage;
};

function formatWhen(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function feedbackHref(page: number): string {
  return queryHref("/feedback", {
    page: page > 1 ? String(page) : null,
  });
}

export async function FeedbackAdminList({ page }: FeedbackAdminListProps) {
  const t = await getTranslations("FeedbackAdmin");
  const locale = await getLocale();
  const { items, page: current, totalPages, total } = page;
  const showPager = totalPages > 1;

  if (items.length === 0) {
    return <p className={css.empty}>{t("empty")}</p>;
  }

  return (
    <PagePanel className={css.wrap}>
      <div className={css.tableWrap}>
        <table className={css.table}>
          <thead>
            <tr>
              <th scope="col">{t("date")}</th>
              <th scope="col">{t("score")}</th>
              <th scope="col">{t("user")}</th>
              <th scope="col">{t("email")}</th>
              <th scope="col">{t("source")}</th>
              <th scope="col">{t("session")}</th>
              <th scope="col">{t("message")}</th>
            </tr>
          </thead>
          <tbody>
              {items.map((row) => (
                <tr key={row.id} id={`fb-${row.id}`}>
                <td>{formatWhen(row.createdAt, locale)}</td>
                <td>{row.score}</td>
                <td>
                  {row.userDisplayName ?? t("guest")}
                  {row.userLogin ? (
                    <span className={css.meta}> {row.userLogin}</span>
                  ) : null}
                </td>
                <td>{row.email ?? "—"}</td>
                <td>{t(`sources.${row.source}`)}</td>
                <td>{row.sessionId ?? "—"}</td>
                <td className={css.message}>{row.message ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showPager ? (
        <nav className={css.pager} aria-label={t("pagerAria")}>
          {current > 1 ? (
            <Link href={feedbackHref(current - 1)} className={css.pagerBtn}>
              ← {t("prevPage")}
            </Link>
          ) : (
            <span className={`${css.pagerBtn} ${css.pagerBtnDisabled}`}>
              ← {t("prevPage")}
            </span>
          )}
          <p className={css.pagerStatus}>
            {t("pageStatus", { page: current, totalPages, total })}
          </p>
          {current < totalPages ? (
            <Link href={feedbackHref(current + 1)} className={css.pagerBtn}>
              {t("nextPage")} →
            </Link>
          ) : (
            <span className={`${css.pagerBtn} ${css.pagerBtnDisabled}`}>
              {t("nextPage")} →
            </span>
          )}
        </nav>
      ) : null}
    </PagePanel>
  );
}
