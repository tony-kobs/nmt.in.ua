import Image from "next/image";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageFrame } from "@/components/dashboard/PageFrame";
import { joinMarathonAction } from "@/modules/marathons/daily/actions";
import { formatKyivWhen } from "@/modules/marathons/daily/calendar";
import { durationLocale, formatMarathonDuration, totalKnownSeconds } from "@/modules/marathons/daily/durationText";
import { loomEmbedSrc, youtubeEmbedSrc } from "@/modules/marathons/daily/richText";
import type { DailyMarathon, DayProgress, Participant } from "@/modules/marathons/daily/store";
import { DeliveryToggles } from "./DeliveryToggles";
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
  rulesHtml: string;
  channelPrompt: string;
  telegramLinked: boolean;
  telegramUsername: string | null;
  introImageUrl?: string | null;
  error?: string;
  saved?: boolean;
};

export async function MarathonMapView({
  marathon,
  days,
  participant,
  locale,
  botReady,
  rulesHtml,
  channelPrompt,
  telegramLinked,
  telegramUsername,
  introImageUrl,
  error,
  saved = false,
}: MarathonMapViewProps) {
  const t = await getTranslations("Marathon");
  const uiLocale = durationLocale(locale);
  const finished = days.filter((day) => day.progress?.completedAt != null);
  const totalSeconds = totalKnownSeconds(finished.map((day) => day.progress?.durationSeconds ?? null));
  const totalLabel = finished.length === 0
    ? null
    : totalSeconds == null
      ? t("totalTimeUnknown")
      : t("totalTime", { time: formatMarathonDuration(totalSeconds, uiLocale) });
  const message = marathonErrorText(t, error);
  const video = marathon.introVideoUrl;
  const src = video ? youtubeEmbedSrc(video) ?? loomEmbedSrc(video) : null;
  return (
    <div className={css.narrow}>
      <SavedToast active={saved} text={t("saved")} />
      <PageFrame
        kicker={t("kicker")}
        title={marathon.title}
        lead={t("mapLead", { days: marathon.daysCount })}
      >
        <div className={css.stack}>
          {message ? <p className={css.alert} role="alert">{message}</p> : null}
          <section className={css.card} aria-labelledby="marathon-rules">
            <h2 id="marathon-rules">{t("rulesTitle")}</h2>
            {introImageUrl ? (
              <Image className={css.shot} src={introImageUrl} alt={marathon.title} width={1200} height={800} unoptimized />
            ) : null}
            {src ? (
              <div className={css.embed}>
                <iframe
                  src={src}
                  title={t("rulesTitle")}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  referrerPolicy="no-referrer"
                />
              </div>
            ) : null}
            <div className={css.prose} dangerouslySetInnerHTML={{ __html: rulesHtml }} />
          </section>
          {participant ? (
            <>
              <p className={css.meta}>{t("streak", { count: participant.streak })}</p>
              <section className={css.card} aria-labelledby="marathon-where">
                <h2 id="marathon-where">{t("whereTitle")}</h2>
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
          ) : marathon.status === "active" ? (
            <form action={joinMarathonAction} className={css.actions}>
              <input type="hidden" name="slug" value={marathon.slug} />
              <button type="submit" className={css.button}>{t("cardJoin")}</button>
            </form>
          ) : (
            <p className={css.lead}>{t("finishedNote")}</p>
          )}
          <section className={css.stack} aria-labelledby="marathon-days">
            <h2 id="marathon-days">{t("daysHeading")}</h2>
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
                      {day.progress?.completedAt != null
                        ? ` · ${
                          day.progress.durationSeconds == null
                            ? t("dayTimeUnknown")
                            : t("dayTime", {
                              time: formatMarathonDuration(day.progress.durationSeconds, uiLocale),
                            })
                        }`
                        : ""}
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
            {totalLabel ? <p className={css.meta}>{totalLabel}</p> : null}
          </section>
          {participant ? (
            <p>
              <Link href={`/marathon/${marathon.slug}/final`} className={css.buttonQuiet}>
                {t("toFinal")}
              </Link>
            </p>
          ) : null}
          <p>
            <Link href="/marathon" className={css.buttonQuiet}>
              {t("backToShelf")}
            </Link>
          </p>
        </div>
      </PageFrame>
    </div>
  );
}
