import { getLocale, getTranslations } from "next-intl/server";
import type { LoginEntry } from "@/modules/auth/userSessions";
import css from "./AdminEntryPoints.module.css";

type AdminEntryPointsProps = {
  entries: LoginEntry[];
};

function formatWhen(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function shortAgent(value: string): string {
  return value.length > 80 ? `${value.slice(0, 79)}…` : value;
}

export async function AdminEntryPoints({ entries }: AdminEntryPointsProps) {
  const t = await getTranslations("AdminProfiles");
  const locale = await getLocale();

  return (
    <section className={css.panel} aria-labelledby="admin-entry-points-title">
      <div>
        <h2 id="admin-entry-points-title" className={css.panelTitle}>
          {t("entryPointsTitle")}
        </h2>
        <p className={css.panelLead}>{t("entryPointsLead")}</p>
      </div>
      {entries.length === 0 ? (
        <p className={css.empty}>{t("entryEmpty")}</p>
      ) : (
        <div className={css.tableWrap}>
          <table className={css.table}>
            <thead>
              <tr>
                <th scope="col">{t("entryWhen")}</th>
                <th scope="col">{t("entryUser")}</th>
                <th scope="col">{t("entryIp")}</th>
                <th scope="col">{t("entryAgent")}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td>{formatWhen(entry.createdAt, locale)}</td>
                  <td>
                    {entry.displayName}
                    <span className={css.meta}> @{entry.login}</span>
                  </td>
                  <td>{entry.ip ?? "—"}</td>
                  <td className={css.agent} title={entry.userAgent ?? undefined}>
                    {entry.userAgent ? shortAgent(entry.userAgent) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
