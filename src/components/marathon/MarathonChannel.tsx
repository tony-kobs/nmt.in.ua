import { getTranslations } from "next-intl/server";
import { PageFrame } from "@/components/dashboard/PageFrame";
import { linkBotAction, setChannelAction } from "@/modules/marathons/daily/actions";
import type { DailyMarathon } from "@/modules/marathons/daily/store";
import css from "./marathon.module.css";

export async function MarathonChannel({
  marathon,
  prompt,
  siteLabel,
  telegramLabel,
  telegramLinked,
  telegramUsername,
  botReady,
}: {
  marathon: DailyMarathon;
  prompt: string;
  siteLabel: string;
  telegramLabel: string;
  telegramLinked: boolean;
  telegramUsername: string | null;
  botReady: boolean;
}) {
  const t = await getTranslations("Marathon");
  return (
    <div className={css.narrow}>
      <PageFrame kicker={t("kicker")} title={t("channelTitle")} lead={marathon.title}>
        <div className={css.stack}>
          <p className={css.lead}>{prompt}</p>
          {telegramLinked ? (
            <p className={css.badgeOn}>
              {t("botJoined")}
              {telegramUsername ? (
                <span translate="no">{` @${telegramUsername}`}</span>
              ) : null}
            </p>
          ) : (
            <div className={css.linkStatus}>
              <p className={css.meta}>{t("botNotJoined")}</p>
              {botReady ? (
                <form action={linkBotAction}>
                  <input type="hidden" name="slug" value={marathon.slug} />
                  <button type="submit" className={css.button}>{t("linkBot")}</button>
                </form>
              ) : (
                <p className={css.meta}>{t("botOff")}</p>
              )}
            </div>
          )}
          <form action={setChannelAction} className={css.stack}>
            <input type="hidden" name="slug" value={marathon.slug} />
            <div className={css.checks}>
              <label>
                <input type="radio" name="channel" value="site" required />
                {siteLabel}
              </label>
              <label>
                <input type="radio" name="channel" value="telegram" />
                {telegramLabel}
              </label>
            </div>
            <button type="submit" className={css.button}>{t("save")}</button>
          </form>
        </div>
      </PageFrame>
    </div>
  );
}
