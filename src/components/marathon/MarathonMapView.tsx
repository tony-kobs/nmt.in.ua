import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageFrame } from "@/components/dashboard/PageFrame";
import { joinMarathonAction } from "@/modules/marathons/daily/actions";
import { DeliveryToggles } from "./DeliveryToggles";
import { formatKyivWhen } from "@/modules/marathons/daily/calendar";
import type { BoardLine } from "@/modules/marathons/daily/leaderboard";
import type { DailyMarathon, DayProgress, Participant } from "@/modules/marathons/daily/store";
import { MarathonBoard } from "./MarathonBoard";
import { SavedToast } from "./SavedToast";
import { marathonErrorText } from "./errors";
import css from "./marathon.module.css";

type DayState = {
  dayNumber: number;
  topic: string;
  open: boolean;
  unlockAt: Date | null;
  progress?: DayProgress;
};

type MarathonMapViewProps = {
  marathon: DailyMarathon;
  days: DayState[];
  participant: Participant | null;
  locale: string;
  botReady: boolean;
  channelPrompt: string;
  telegramLinked: boolean;
  telegramUsername: string | null;
  board: BoardLine[];
  error?: string;
  saved?: boolean;
};

export async function MarathonMapView({
  marathon,
  days,
  participant,
  locale,
  botReady,
  channelPrompt,
  telegramLinked,
  telegramUsername,
  board,
  error,
  saved = false,
}: MarathonMapViewProps) {
  const t = await getTranslations("Marathon");
  const message = marathonErrorText(t, error);
  return (
    <div className={css.narrow}>
      <SavedToast active={saved} text={t("saved")} />
      <PageFrame
        kicker={t("kicker")}
        title={marathon.title}
        lead={t("mapLead", { days: marathon.daysCount })}
      >
        <div className={css.stack}>
          {marathon.status === "finished" ? (
            <p className={css.lead}>{t("finishedNote")}</p>
          ) : null}
          {message ? <p className={css.alert} role="alert">{message}</p> : null}
          {participant ? (
            <>
              <p className={css.meta}>{t("streak", { count: participant.streak })}</p>
              <MarathonBoard
                rows={board}
                selfId={participant.userId}
                titleId="marathon-board"
              />
            </>
          ) : marathon.status === "active" ? (
            <form action={joinMarathonAction} className={css.actions}>
              <input type="hidden" name="slug" value={marathon.slug} />
              <button type="submit" className={css.button}>{t("join")}</button>
            </form>
          ) : null}
          <ol className={css.days}>
            {days.map((day) => {
              const body = (
                <>
                  <span className={css.kicker}>{t("dayLabel", { n: day.dayNumber })}</span>
                  <strong>{day.topic}</strong>
                  <span className={css.meta}>
                    {day.progress?.completedAt != null
                      ? day.progress.passed
                        ? t("markPassed", { score: day.progress.score ?? 0 })
                        : t("markFailed", { score: day.progress.score ?? 0 })
                      : day.open
                        ? t("open")
                        : t("opensAt", {
                            when: day.unlockAt ? formatKyivWhen(day.unlockAt, locale) : "",
                          })}
                  </span>
                </>
              );
              if (!day.open || !participant) {
                return (
                  <li key={day.dayNumber} className={`${css.day} ${css.locked}`}>
                    {body}
                  </li>
                );
              }
              return (
                <li key={day.dayNumber}>
                  <Link
                    href={`/marathon/${marathon.slug}/day/${day.dayNumber}`}
                    className={`${css.day} ${day.progress?.passed ? css.passed : ""}`}
                  >
                    {body}
                  </Link>
                </li>
              );
            })}
          </ol>
          {participant ? (
            <>
              <p>
                <Link href={`/marathon/${marathon.slug}/final`} className={css.buttonQuiet}>
                  {t("toFinal")}
                </Link>
              </p>
              <p>
                <Link href={`/marathon/${marathon.slug}/map?panel=rules`} className={css.buttonQuiet}>
                  {t("introAgain")}
                </Link>
              </p>
              <section className={css.card} aria-labelledby="marathon-notify" id="notify">
                <h2 id="marathon-notify">{t("channelTitle")}</h2>
                <DeliveryToggles
                  slug={marathon.slug}
                  prompt={channelPrompt}
                  emailOn={participant.notifyEmail}
                  telegramOn={participant.notifyBot}
                  telegramLinked={telegramLinked || Boolean(participant.telegramChatId)}
                  telegramUsername={telegramUsername}
                  botReady={botReady}
                />
              </section>
            </>
          ) : null}
        </div>
      </PageFrame>
    </div>
  );
}
