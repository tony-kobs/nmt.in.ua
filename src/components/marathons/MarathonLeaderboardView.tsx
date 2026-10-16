import Link from "next/link";
import clsx from "clsx";
import { boardShowsSpeed } from "@/modules/marathons/boardStats";
import { formatPercent, formatSpeed } from "@/modules/results/types";
import type { MarathonLeaderboardView as LeaderboardData } from "@/modules/marathons/types";
import { getTranslations } from "next-intl/server";
import { MarathonJoinForm } from "./MarathonJoinForm";
import { MarathonPicker } from "./MarathonPicker";
import css from "./MarathonLeaderboard.module.css";

export type MarathonLeaderboardMode = "student" | "teacher" | "admin";

type Props = {
  data: LeaderboardData;
  mode: MarathonLeaderboardMode;
};

function formatAvgSec(sec: number | null): string {
  if (sec == null) return "—";
  return formatSpeed(sec);
}

function optionLabel(
  option: { title: string; status: string },
  finished: string,
): string {
  return option.status === "finished" ? `${option.title} · ${finished}` : option.title;
}

function visibleLogin(
  mode: MarathonLeaderboardMode,
  row: {
    login: string;
    isCurrentUser: boolean;
    isRosterStudent: boolean;
  },
): string | null {
  if (row.isCurrentUser || mode === "admin") return row.login;
  if (mode === "teacher" && row.isRosterStudent) return row.login;
  return null;
}

export async function MarathonLeaderboardView({ data, mode }: Props) {
  const t = await getTranslations("MarathonLeaderboard");
  const {
    marathon,
    options,
    rows,
    participantCount,
    isParticipant,
    currentUserRank,
    rosterParticipantCount,
    rosterSize,
  } = data;
  const daily = marathon.kind === "daily";
  const showSpeed = boardShowsSpeed(marathon.kind, rows);

  return (
    <div className={css.root}>
      {options.length > 1 ? (
        <MarathonPicker
          label={t("pickerLabel")}
          value={marathon.slug}
          options={options.map((option) => ({
            value: option.slug,
            label: optionLabel(option, t("statusFinished")),
          }))}
        />
      ) : null}
      <div className={css.marathonMeta}>
        <p className={css.marathonTitle}>{marathon.title}</p>
        {daily && marathon.description ? (
          <p className={css.marathonDesc}>{marathon.description}</p>
        ) : null}
        <p className={css.marathonRules}>
          {daily ? t("rulesDaily") : t("rules", { min: marathon.min_tasks_per_session })}
        </p>
      </div>

      {mode === "teacher" ? (
        <p className={css.monitorBanner} role="status">
          {t("teacherRoster", {
            joined: rosterParticipantCount,
            total: rosterSize,
          })}
          {rosterSize > 0 ? (
            <>
              {" "}
              <Link href="/students" className={css.monitorLink}>
                {t("teacherStudentsLink")}
              </Link>
            </>
          ) : null}
        </p>
      ) : null}

      {mode === "admin" ? (
        <p className={css.monitorBanner} role="status">
          {t("adminMonitor", { count: participantCount })}
        </p>
      ) : null}

      {mode === "student" && !isParticipant && daily ? (
        <p className={css.monitorBanner}>
          <Link className={css.joinBtn} href={`/marathon/${marathon.slug}`}>
            {t("openMarathon")}
          </Link>
        </p>
      ) : null}

      {mode === "student" && !isParticipant && !daily ? (
        <section className={css.joinPanel} aria-labelledby="marathon-join-title">
          <h2 id="marathon-join-title" className={css.joinTitle}>
            {t("joinTitle")}
          </h2>
          <MarathonJoinForm />
        </section>
      ) : null}

      {mode === "student" && isParticipant && currentUserRank != null ? (
        <p className={css.myRank} role="status">
          {t("yourRank", { rank: currentUserRank, total: participantCount })}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className={css.empty} role="status">
          {daily ? t("emptyDaily") : t("empty")}
        </p>
      ) : (
        <>
          <ul className={css.cardList} aria-label={t("tableAria")}>
            {rows.map((row) => {
              const login = visibleLogin(mode, row);
              return (
              <li
                key={row.userId}
                className={clsx(
                  css.card,
                  row.isCurrentUser && css.cardSelf,
                  mode === "teacher" &&
                    row.isRosterStudent &&
                    css.cardRoster,
                )}
              >
                <div className={css.cardTop}>
                  <span className={css.rank}>#{row.rank}</span>
                  <span className={css.name}>
                    {row.displayName}
                    {login ? <span className={css.login}>@{login}</span> : null}
                  </span>
                </div>
                <dl className={css.meta}>
                  {daily ? (
                    <div>
                      <dt>{t("days")}</dt>
                      <dd>{row.daysDone}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>{t("avgPercent")}</dt>
                    <dd>{formatPercent(row.avgPercent)}</dd>
                  </div>
                  {daily ? (
                    <div>
                      <dt>{t("points")}</dt>
                      <dd>{row.points}</dd>
                    </div>
                  ) : null}
                  {showSpeed ? (
                    <div>
                      <dt>{t("speed")}</dt>
                      <dd>{formatAvgSec(row.avgSecPerTask)}</dd>
                    </div>
                  ) : null}
                  {daily ? null : (
                    <div>
                      <dt>{t("sessions")}</dt>
                      <dd>{row.sessionsCount}</dd>
                    </div>
                  )}
                </dl>
              </li>
              );
            })}
          </ul>

          <div className={css.tableWrap}>
            <table className={css.table}>
              <thead>
                <tr>
                  <th scope="col">{t("colRank")}</th>
                  <th scope="col">{t("colName")}</th>
                  {daily ? <th scope="col">{t("days")}</th> : null}
                  <th scope="col">{t("avgPercent")}</th>
                  {daily ? <th scope="col">{t("points")}</th> : null}
                  {showSpeed ? <th scope="col">{t("speed")}</th> : null}
                  {daily ? null : <th scope="col">{t("sessions")}</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const login = visibleLogin(mode, row);
                  return (
                  <tr
                    key={row.userId}
                    className={clsx(
                      row.isCurrentUser && css.rowSelf,
                      mode === "teacher" &&
                        row.isRosterStudent &&
                        css.rowRoster,
                    )}
                  >
                    <td className={css.colRank}>{row.rank}</td>
                    <td className={css.colName}>
                      {row.displayName}
                      {login ? <span className={css.login}>@{login}</span> : null}
                    </td>
                    {daily ? <td className={css.colMetric}>{row.daysDone}</td> : null}
                    <td className={css.colMetric}>
                      {formatPercent(row.avgPercent)}
                    </td>
                    {daily ? <td className={css.colMetric}>{row.points}</td> : null}
                    {showSpeed ? (
                      <td className={css.colMetric}>
                        {formatAvgSec(row.avgSecPerTask)}
                      </td>
                    ) : null}
                    {daily ? null : <td className={css.colMetric}>{row.sessionsCount}</td>}
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

    </div>
  );
}
