import { getLocale, getTranslations } from "next-intl/server";
import { durationLocale, formatMarathonDuration } from "@/modules/marathons/daily/durationText";
import { visibleBoard, type BoardLine } from "@/modules/marathons/daily/leaderboard";
import css from "./marathon.module.css";

export async function MarathonBoard({
  rows,
  selfId,
  limit = 10,
  titleId,
}: {
  rows: BoardLine[];
  selfId: number | null;
  /** `null` shows every participant (admin). */
  limit?: number | null;
  titleId: string;
}) {
  const t = await getTranslations("Marathon");
  const uiLocale = durationLocale(await getLocale());
  const view = limit == null
    ? {
        top: rows,
        self: selfId == null ? null : rows.find((row) => row.userId === selfId) ?? null,
        selfOutside: false,
      }
    : visibleBoard(rows, selfId, limit);
  const lines = view.selfOutside && view.self ? [...view.top, view.self] : view.top;
  return (
    <section className={css.card} aria-labelledby={titleId}>
      <h2 id={titleId}>{t("boardTitle")}</h2>
      {lines.length === 0 ? (
        <p className={css.meta}>{t("boardEmpty")}</p>
      ) : (
        <ol className={css.board}>
          {view.top.map((row) => (
            <BoardRow
              key={row.userId}
              row={row}
              you={row.userId === selfId}
              pointsLabel={t("boardPoints", { count: row.points })}
              timeLabel={boardTimeLabel(t, uiLocale, row)}
              streakLabel={row.streak > 0 ? t("boardStreak", { count: row.streak }) : ""}
              youLabel={t("boardYou")}
            />
          ))}
          {view.selfOutside && view.self ? (
            <li className={css.boardGap} aria-hidden="true">…</li>
          ) : null}
          {view.selfOutside && view.self ? (
            <BoardRow
              row={view.self}
              you
              pointsLabel={t("boardPoints", { count: view.self.points })}
              timeLabel={boardTimeLabel(t, uiLocale, view.self)}
              streakLabel={view.self.streak > 0 ? t("boardStreak", { count: view.self.streak }) : ""}
              youLabel={t("boardYou")}
            />
          ) : null}
        </ol>
      )}
    </section>
  );
}

function boardTimeLabel(
  t: Awaited<ReturnType<typeof getTranslations>>,
  locale: ReturnType<typeof durationLocale>,
  row: BoardLine,
): string {
  if (row.totalTimeSec != null) return formatMarathonDuration(row.totalTimeSec, locale);
  if (row.points > 0) return t("boardTimeUnknown");
  return "";
}

function BoardRow({
  row,
  you,
  pointsLabel,
  timeLabel,
  streakLabel,
  youLabel,
}: {
  row: BoardLine;
  you: boolean;
  pointsLabel: string;
  timeLabel: string;
  streakLabel: string;
  youLabel: string;
}) {
  return (
    <li className={you ? `${css.boardRow} ${css.boardYou}` : css.boardRow}>
      <span className={css.boardPlace}>{row.place}</span>
      <span className={css.boardName}>
        {row.name}
        {you ? <span className={css.meta}> {youLabel}</span> : null}
      </span>
      <span className={css.boardPoints}>
        {pointsLabel}
        {timeLabel ? <span className={css.meta}> · {timeLabel}</span> : null}
        {streakLabel ? <span className={css.meta}> · {streakLabel}</span> : null}
      </span>
    </li>
  );
}
