import { getTranslations } from "next-intl/server";
import type { FunnelReport } from "@/modules/marathons/daily/funnel";
import css from "../marathon.module.css";

export async function MarathonFunnelStrip({ funnel }: { funnel: FunnelReport }) {
  const t = await getTranslations("Marathon");
  const days = funnel.totals.days
    .map((count, index) => `${t("dayLabel", { n: index + 1 })}: ${count}`)
    .join(" · ");
  return (
    <section className={`${css.funnelStrip} ${css.anchor}`} aria-labelledby="funnel">
      <h2 id="funnel" className={css.funnelTitle}>
        {t("funnelTitle")}
      </h2>
      <p className={css.funnelLine}>
        {t("funnelLine", {
          registered: funnel.totals.registered,
          verified: funnel.totals.emailVerified,
          final: funnel.totals.final,
          converted: funnel.totals.converted,
        })}
      </p>
      {days ? <p className={css.funnelDays}>{days}</p> : null}
      {funnel.bySource.length > 0 ? (
        <ul className={css.funnelSources}>
          {funnel.bySource.map((row) => (
            <li key={row.source}>
              {row.source}: {row.counts.registered} / {row.counts.emailVerified} / {row.counts.converted}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
