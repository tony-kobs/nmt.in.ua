import Link from "next/link";
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
          {marathon.status === "finished" ? (
            <p className={css.lead}>{t("finishedNote")}</p>
          ) : null}
          {summary ? <p className={css.lead}>{summary}</p> : null}
          <p className={css.badge}>{badge}</p>
          <p className={css.meta}>{t("streak", { count: participant.streak })}</p>
          <section className={css.stack} aria-labelledby="final-days">
            <h2 id="final-days">{t("daysHeading")}</h2>
            <ol className={css.days}>
              {days.map((day) => {
                const mark = byDay.get(day.dayNumber);
                return (
                  <li key={day.id}>
                    <Link
                      href={`/marathon/${marathon.slug}/day/${day.dayNumber}`}
                      className={`${css.day} ${mark?.passed ? css.passed : ""}`}
                    >
                      <span className={css.kicker}>{t("dayLabel", { n: day.dayNumber })}</span>
                      <strong>{day.topic}</strong>
                      <span className={css.meta}>
                        {mark?.completedAt == null
                          ? t("notDone")
                          : mark.passed
                            ? t("markPassed", { score: mark.score ?? 0 })
                            : t("markFailed", { score: mark.score ?? 0 })}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </section>
          {weak.length > 0 ? (
            <section className={css.card} aria-labelledby="weak-topics">
              <h2 id="weak-topics">{t("weakTitle")}</h2>
              <ul>
                {weak.map((day) => (
                  <li key={day.id}>{day.topic}</li>
                ))}
              </ul>
            </section>
          ) : null}
          {marathon.finalCtaText && marathon.finalCtaUrl ? (
            <form action={convertMarathonAction}>
              <input type="hidden" name="slug" value={marathon.slug} />
              <button type="submit" className={css.button}>{marathon.finalCtaText}</button>
            </form>
          ) : null}
          <div className={css.actions}>
            <Link
              href={`/leaderboard?marathon=${encodeURIComponent(marathon.slug)}`}
              className={css.buttonQuiet}
            >
              {t("leaderboardLink")}
            </Link>
            <Link href="/marathon" className={css.buttonQuiet}>
              {t("backToShelf")}
            </Link>
          </div>
        </div>
      </PageFrame>
    </div>
  );
}
