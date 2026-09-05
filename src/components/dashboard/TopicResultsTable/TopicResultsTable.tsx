import Link from "next/link";
import clsx from "clsx";
import {
  formatPercent,
  formatSpeed,
  getScoreLevel,
  type TopicResultRow,
} from "@/modules/results/types";
import { getTranslations } from "next-intl/server";
import css from "./TopicResultsTable.module.css";

type TopicResultsTableProps = {
  rows: TopicResultRow[];
};

function metricClass(percent: number | null): string {
  switch (getScoreLevel(percent)) {
    case "high":
      return css.metricHigh;
    case "medium":
      return css.metricMedium;
    case "low":
      return css.metricLow;
    default:
      return css.metricNone;
  }
}

export async function TopicResultsTable({ rows }: TopicResultsTableProps) {
  const t = await getTranslations("TopicResultsTable");
  return (
    <section className={css.topicResults} aria-labelledby="topic-results-title">
      <header className={css.intro}>
        <h1 id="topic-results-title" className={css.title}>
          {t("title")}
        </h1>

        <p className={css.lead}>{t("lead")}</p>
      </header>

      <div className={css.tableWrap}>
        <table className={css.table}>
          <thead>
            <tr>
              <th scope="col">{t("topic")}</th>
              <th scope="col">{t("overall")}</th>
              <th scope="col">{t("lastThree")}</th>
              <th scope="col">{t("speed")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.themeId}>
                <td className={css.themeCell}>
                  <Link
                    href={`/materials/textbook#topic-${row.themeCode}`}
                    className={css.themeLink}
                  >
                    {row.displayIndex}. {row.themeName}
                  </Link>
                </td>
                <td
                  className={clsx(css.metric, metricClass(row.overallPercent))}
                >
                  {formatPercent(row.overallPercent)}
                </td>
                <td
                  className={clsx(
                    css.metric,
                    metricClass(row.lastThreePercent),
                  )}
                >
                  {formatPercent(row.lastThreePercent)}
                </td>
                <td className={clsx(css.metric, css.metricNone)}>
                  {formatSpeed(row.avgSecondsPerTask)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className={css.hint}>{t("hint")}</p>
    </section>
  );
}
