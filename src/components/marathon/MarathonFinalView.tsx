import { getTranslations } from "next-intl/server";
import { PageFrame } from "@/components/dashboard/PageFrame";
import { convertMarathonAction } from "@/modules/marathons/daily/actions";
import type { DailyMarathon, DayProgress, MarathonDay, Participant } from "@/modules/marathons/daily/store";
import css from "./marathon.module.css";

type MarathonFinalViewProps = {
  marathon: DailyMarathon;
  days: MarathonDay[];
  progress: DayProgress[];
  participant: Participant;
  summary: string;
};

export async function MarathonFinalView({
  marathon,
  days,
  progress,
  participant,
  summary,
}: MarathonFinalViewProps) {
  const t = await getTranslations("Marathon");
  const byDay = new Map(progress.map((item) => [item.dayNumber, item]));
  const weak = days.filter((day) => {
    const mark = byDay.get(day.dayNumber);
    return !mark?.completedAt || !mark.passed;
  });
  const allPassed = days.length > 0 && days.every((day) => byDay.get(day.dayNumber)?.passed);
  const allDone = days.length > 0 && days.every((day) => byDay.get(day.dayNumber)?.completedAt);
  const badge = allPassed ? t("badgeAll") : allDone ? t("badgeFinish") : t("badgePartial");
  return (
    <div className={css.narrow}>
      <PageFrame kicker={t("kicker")} title={t("finalTitle")} lead={marathon.title}>
        <div className={css.stack}>
          {summary ? <p className={css.lead}>{summary}</p> : null}
          <p className={css.badge}>{badge}</p>
          <p className={css.meta}>{t("streak", { count: participant.streak })}</p>
          <ol className={css.stack}>
            {days.map((day) => {
              const mark = byDay.get(day.dayNumber);
              return (
                <li key={day.id}>
                  {t("dayLabel", { n: day.dayNumber })} — {day.topic}
                  {": "}
                  {mark?.completedAt == null
                    ? t("notDone")
                    : mark.passed
                      ? t("markPassed", { score: mark.score ?? 0 })
                      : t("markFailed", { score: mark.score ?? 0 })}
                </li>
              );
            })}
          </ol>
          <section className={css.card} aria-labelledby="weak-topics">
            <h2 id="weak-topics">{t("weakTitle")}</h2>
            {weak.length === 0 ? (
              <p className={css.lead}>{t("noWeak")}</p>
            ) : (
              <ul>
                {weak.map((day) => (
                  <li key={day.id}>{day.topic}</li>
                ))}
              </ul>
            )}
          </section>
          {marathon.finalCtaText && marathon.finalCtaUrl ? (
            <form action={convertMarathonAction}>
              <input type="hidden" name="slug" value={marathon.slug} />
              <button type="submit" className={css.button}>{marathon.finalCtaText}</button>
            </form>
          ) : null}
        </div>
      </PageFrame>
    </div>
  );
}
