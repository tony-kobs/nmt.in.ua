import Image from "next/image";
import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { joinMarathonAction } from "@/modules/marathons/daily/actions";
import { formatKyivWhen } from "@/modules/marathons/daily/calendar";
import { parkingIntro } from "@/modules/marathons/daily/parkingIntro";
import type { DailyMarathon } from "@/modules/marathons/daily/store";
import type { UtmParams } from "@/modules/marathons/daily/utm";
import { marathonErrorText } from "./errors";
import { UtmFields } from "./UtmFields";
import css from "./marathon.module.css";

type MarathonParkingProps = {
  marathon: DailyMarathon;
  /** Day-1 unlock. Omitted when the schedule cannot be read. */
  opensAt: Date | null;
  loggedIn: boolean;
  joined: boolean;
  utm: UtmParams;
  /** `/api/marathon-media/<token>` for the intro photo. Null when none is stored. */
  introImageUrl?: string | null;
  /** Resolved intro rules, before `{name}`. Empty hides the block. */
  rules?: string;
  viewerName?: string;
  error?: string;
};

/** Waiting page for a course that exists but is not open yet. */
export async function MarathonParking({
  marathon,
  opensAt,
  loggedIn,
  joined,
  utm,
  introImageUrl,
  rules = "",
  viewerName = "",
  error,
}: MarathonParkingProps) {
  const t = await getTranslations("Marathon");
  const locale = await getLocale();
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(utm)) {
    if (value) query.set(key, value);
  }
  const joinHref = `/marathon/${marathon.slug}/join${query.size ? `?${query}` : ""}`;
  const returnHref = `/marathon/${marathon.slug}`;
  const when = opensAt ? formatKyivWhen(opensAt, locale) : "";
  const message = marathonErrorText(t, error);
  const intro = parkingIntro({
    title: marathon.title,
    description: marathon.description,
    introVideoUrl: marathon.introVideoUrl,
    introImageUrl,
    rules,
    name: viewerName,
  });

  return (
    <div className={`${css.narrow} ${css.stack}`}>
      {intro.imageUrl ? (
        <Image
          className={css.hero}
          src={intro.imageUrl}
          alt={intro.imageAlt}
          width={1200}
          height={800}
          sizes="(min-width: 768px) 46rem, 100vw"
          unoptimized
        />
      ) : null}
      <p className={css.kicker}>{t("kicker")}</p>
      <h1 className={css.title}>{marathon.title}</h1>
      {intro.description ? <p className={css.lead}>{intro.description}</p> : null}
      {intro.videoSrc || intro.rulesHtml ? (
        <section className={css.card} aria-labelledby="marathon-parking-intro">
          <h2 id="marathon-parking-intro">{t("rulesTitle")}</h2>
          {intro.videoSrc ? (
            <div className={css.embed}>
              <iframe
                src={intro.videoSrc}
                title={t("rulesTitle")}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                referrerPolicy="no-referrer"
              />
            </div>
          ) : null}
          {intro.rulesHtml ? (
            <div className={css.prose} dangerouslySetInnerHTML={{ __html: intro.rulesHtml }} />
          ) : null}
        </section>
      ) : null}
      <p className={css.lead}>{t("parkingLead")}</p>
      {when ? <p className={css.meta}>{t("parkingWhen", { when })}</p> : null}
      {message ? (
        <p className={css.alert} role="alert">{message}</p>
      ) : null}
      {joined ? (
        <div className={css.stack}>
          <p className={css.alert} role="status">{t("parkingJoined")}</p>
          {marathon.status === "active" && marathon.startDate ? (
            <div className={css.actions}>
              <Link href={`/marathon/${marathon.slug}/map`} className={css.buttonQuiet}>
                {t("cardAbout")}
              </Link>
            </div>
          ) : null}
        </div>
      ) : loggedIn ? (
        <form action={joinMarathonAction} className={css.actions}>
          <input type="hidden" name="slug" value={marathon.slug} />
          <UtmFields utm={utm} />
          <button type="submit" className={css.button}>
            {t("parkingJoin")}
          </button>
        </form>
      ) : (
        <div className={css.actions}>
          <Link href={joinHref} className={css.button}>
            {t("parkingJoin")}
          </Link>
          <Link href={`/login?next=${encodeURIComponent(returnHref)}`} className={css.buttonQuiet}>
            {t("haveAccount")}
          </Link>
        </div>
      )}
    </div>
  );
}
