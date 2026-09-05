import { getLocale, getTranslations } from "next-intl/server";
import { PagePanel, PageSection } from "@/components/dashboard/PageFrame";
import type { SiteFeedback } from "@/modules/feedback/types";
import css from "./FeedbackAdminList.module.css";

type FeedbackAdminListProps = {
  rows: SiteFeedback[];
};

function formatWhen(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

export async function FeedbackAdminList({ rows }: FeedbackAdminListProps) {
  const t = await getTranslations("FeedbackAdmin");
  const locale = await getLocale();

  return (
    <PageSection id="site-feedback-title" title={t("title")} lead={t("lead")}>
      {rows.length === 0 ? (
        <p className={css.empty}>{t("empty")}</p>
      ) : (
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
                {rows.map((row) => (
                  <tr key={row.id}>
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
        </PagePanel>
      )}
    </PageSection>
  );
}
