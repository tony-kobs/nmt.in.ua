import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { joinMarathonAction } from "@/modules/marathons/daily/actions";
import type { BoardLine } from "@/modules/marathons/daily/leaderboard";
import type { DailyMarathon, Riddle } from "@/modules/marathons/daily/store";
import type { UtmParams } from "@/modules/marathons/daily/utm";
import { MarathonBoard } from "./MarathonBoard";
import { UtmFields } from "./UtmFields";
import { marathonErrorText } from "./errors";
import css from "./marathon.module.css";

type MarathonLandingProps = {
  marathon: DailyMarathon;
  riddles: Riddle[];
  loggedIn: boolean;
  utm: UtmParams;
  error?: string;
  board?: BoardLine[];
  viewerId?: number | null;
};

export async function MarathonLanding({
  marathon,
  riddles,
  loggedIn,
  utm,
  error,
  board = [],
  viewerId = null,
}: MarathonLandingProps) {
  const t = await getTranslations("Marathon");
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(utm)) {
    if (value) query.set(key, value);
  }
  const joinHref = `/marathon/${marathon.slug}/join${query.size ? `?${query}` : ""}`;

  return (
    <div className={css.stack}>
      <p className={css.kicker}>{t("kicker")}</p>
      <h1 className={css.title}>{marathon.title}</h1>
      <p className={css.lead}>{t("landingLead", { days: marathon.daysCount })}</p>
      {marathonErrorText(t, error) ? (
        <p className={css.alert} role="alert">{marathonErrorText(t, error)}</p>
      ) : null}
      <section className={css.stack} aria-labelledby="marathon-riddles">
        <h2 id="marathon-riddles">{t("riddlesTitle")}</h2>
        {riddles.map((riddle) => (
          <article key={riddle.id} className={css.card}>
            <h3>{riddle.title}</h3>
            <p>{riddle.body}</p>
            {riddle.hint ? (
              <details>
                <summary>{t("showHint")}</summary>
                <p>{riddle.hint}</p>
              </details>
            ) : null}
            <details>
              <summary>{t("showAnswer")}</summary>
              <p>{riddle.answer}</p>
            </details>
          </article>
        ))}
      </section>
      {marathon.status === "active" ? (
        loggedIn ? (
          <form action={joinMarathonAction} className={css.actions}>
            <input type="hidden" name="slug" value={marathon.slug} />
            <UtmFields utm={utm} />
            <button type="submit" className={css.button}>
              {t("join")}
            </button>
          </form>
        ) : (
          <div className={css.actions}>
            <Link href={joinHref} className={css.button}>
              {t("join")}
            </Link>
            <Link href={`/login?next=${encodeURIComponent(`/marathon/${marathon.slug}/map`)}`} className={css.buttonQuiet}>
              {t("haveAccount")}
            </Link>
          </div>
        )
      ) : (
        <>
          <p className={css.lead}>{t("finishedNote")}</p>
          <MarathonBoard
            rows={board}
            selfId={viewerId}
            titleId="marathon-finished-board"
          />
          {loggedIn ? (
            <Link href={`/marathon/${marathon.slug}/map`} className={css.button}>
              {t("finishedMap")}
            </Link>
          ) : null}
        </>
      )}
    </div>
  );
}
