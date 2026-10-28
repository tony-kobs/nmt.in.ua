import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import { joinMarathonAction } from "@/modules/marathons/daily/actions";
import { formatKyivWhen } from "@/modules/marathons/daily/calendar";
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
  error?: string;
};

/** Waiting page for a course that exists but is not open yet. */
export async function MarathonParking({
  marathon,
  opensAt,
  loggedIn,
  joined,
  utm,
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

  return (
    <div className={`${css.narrow} ${css.stack}`}>
      <p className={css.kicker}>{t("kicker")}</p>
      <h1 className={css.title}>{marathon.title}</h1>
      {marathon.description ? <p className={css.lead}>{marathon.description}</p> : null}
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
