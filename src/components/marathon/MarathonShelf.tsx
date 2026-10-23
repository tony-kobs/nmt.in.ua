import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { PageFrame } from "@/components/dashboard/PageFrame";
import { MarathonPicker } from "@/components/marathons/MarathonPicker";
import { ALL_MARATHONS_SLUG, boardShowsSpeed } from "@/modules/marathons/boardStats";
import { joinMarathonAction } from "@/modules/marathons/daily/actions";
import type { ShelfCard } from "@/modules/marathons/daily/shelf";
import type { MarathonLeaderboardRow, MarathonLeaderboardView } from "@/modules/marathons/types";
import { durationLocale, formatMarathonDurationOrDash } from "@/modules/marathons/daily/durationText";
import { formatPercent, formatSpeed } from "@/modules/results/types";
import board from "./MarathonHomeCards.module.css";
import css from "./marathon.module.css";

export async function MarathonShelf({
  cards,
  leaderboard,
}: {
  cards: ShelfCard[];
  leaderboard: MarathonLeaderboardView | null;
}) {
  const t = await getTranslations("Marathon");
  const boardT = await getTranslations("MarathonLeaderboard");
  const uiLocale = durationLocale(await getLocale());
  const allTime = leaderboard?.marathon.slug === ALL_MARATHONS_SLUG;
  const daily = leaderboard?.marathon.kind === "daily";
  const showSpeed = leaderboard
    ? boardShowsSpeed(leaderboard.marathon.kind, leaderboard.rows)
    : false;
  const options =
    leaderboard && leaderboard.options.length > 1
      ? leaderboard.options.map((option) => ({
          value: option.slug,
          label:
            option.slug === ALL_MARATHONS_SLUG
              ? boardT("allMarathons")
              : option.status === "finished"
                ? `${option.title} · ${boardT("statusFinished")}`
                : option.status === "archived"
                  ? `${option.title} · ${boardT("statusArchived")}`
                  : option.title,
        }))
      : [];
  const showBoardTitle =
    leaderboard != null &&
    !allTime &&
    (cards.length !== 1 || cards[0]?.slug !== leaderboard.marathon.slug);

  return (
    <PageFrame title={t("kicker")} lead={t("shelfLead")}>
      {options.length > 0 && leaderboard ? (
        <div className={css.boardPicker}>
          <MarathonPicker
            label={boardT("pickerLabel")}
            value={leaderboard.marathon.slug}
            options={options}
            path="/marathon"
          />
        </div>
      ) : null}
      <div className={board.wood}>
        <div className={board.slate}>
          <div className={board.panels}>
            <div className={css.courses}>
              {cards.length === 0 ? (
                <article className={board.panel}>
                  <p className={board.empty}>{t("shelfEmpty")}</p>
                </article>
              ) : (
                cards.map((card) => {
                  const current = leaderboard?.marathon.slug === card.slug;
                  return (
                    <article
                      key={card.slug}
                      className={[board.panel, css.course, current ? css.courseCurrent : ""]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <p className={css.kicker}>{t(`status.${card.status}`)}</p>
                      <h2 className={board.marathonTitle}>{card.title}</h2>
                      {card.description ? (
                        <p className={board.marathonText}>{card.description}</p>
                      ) : null}
                      <p className={board.day}>{t("cardDays", { count: card.daysCount })}</p>
                      <div className={`${board.actions} ${css.courseActions}`}>
                        {card.joined ? (
                          <Link href={card.href} className={board.button}>
                            {card.status === "finished" ? t("cardSummary") : t("cardAbout")}
                          </Link>
                        ) : (
                          <form action={joinMarathonAction}>
                            <input type="hidden" name="slug" value={card.slug} />
                            <button type="submit" className={board.button}>
                              {t("cardJoin")}
                            </button>
                          </form>
                        )}
                      </div>
                    </article>
                  );
                })
              )}
            </div>
            <section
              className={`${board.panel} ${css.standingsPanel}`}
              aria-labelledby="marathon-shelf-board"
            >
              <h2 id="marathon-shelf-board" className={board.marathonTitle}>
                {allTime ? boardT("allMarathons") : t("homeBoard")}
              </h2>
              {showBoardTitle && leaderboard ? (
                <p className={board.marathonText}>{leaderboard.marathon.title}</p>
              ) : null}
              {leaderboard ? (
                <p className={css.boardRules}>
                  {allTime
                    ? boardT("rulesAll")
                    : daily
                      ? boardT("rulesDaily")
                      : boardT("rules", { min: leaderboard.marathon.min_tasks_per_session })}
                </p>
              ) : (
                <p className={board.empty}>{boardT("noActiveMarathon")}</p>
              )}
              {leaderboard && leaderboard.isParticipant && leaderboard.currentUserRank != null ? (
                <p className={css.boardRank} role="status">
                  {boardT("yourRank", {
                    rank: leaderboard.currentUserRank,
                    total: leaderboard.participantCount,
                  })}
                </p>
              ) : null}
              {leaderboard && leaderboard.rows.length === 0 ? (
                <p className={board.empty} role="status">
                  {daily ? boardT("emptyDaily") : boardT("empty")}
                </p>
              ) : null}
              {leaderboard && leaderboard.rows.length > 0 ? (
                <ol className={css.standings} aria-label={boardT("tableAria")}>
                  {leaderboard.rows.map((row) => (
                    <li
                      key={row.userId}
                      className={[css.standing, row.isCurrentUser ? css.standingYou : ""]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <span className={css.standingPlace}>{row.rank}</span>
                      <span className={css.standingName}>
                        {row.displayName}
                        {row.isCurrentUser ? (
                          <span className={css.standingYouMark}> · {t("boardYou")}</span>
                        ) : null}
                      </span>
                      <span className={css.standingStats}>
                        {standingStats(row, {
                          daily: Boolean(daily),
                          showSpeed,
                          days: boardT("days"),
                          percent: boardT("avgPercent"),
                          points: t("boardPoints", { count: row.points }),
                          time: formatMarathonDurationOrDash(row.totalTimeSec, uiLocale),
                          sessions: boardT("sessions"),
                          speed: boardT("speed"),
                        })}
                      </span>
                    </li>
                  ))}
                </ol>
              ) : null}
            </section>
          </div>
        </div>
      </div>
    </PageFrame>
  );
}

function standingStats(
  row: Pick<
    MarathonLeaderboardRow,
    "daysDone" | "avgPercent" | "sessionsCount" | "avgSecPerTask" | "totalTimeSec"
  >,
  labels: {
    daily: boolean;
    showSpeed: boolean;
    days: string;
    percent: string;
    points: string;
    time: string;
    sessions: string;
    speed: string;
  },
): string {
  const parts: string[] = [];
  if (labels.daily) parts.push(`${labels.days} ${row.daysDone}`);
  parts.push(`${labels.percent} ${formatPercent(row.avgPercent)}`);
  if (labels.daily) parts.push(`${labels.points} · ${labels.time}`);
  else parts.push(`${labels.sessions} ${row.sessionsCount}`);
  if (labels.showSpeed) {
    parts.push(`${labels.speed} ${formatSpeed(row.avgSecPerTask)}`);
  }
  return parts.join(" · ");
}
