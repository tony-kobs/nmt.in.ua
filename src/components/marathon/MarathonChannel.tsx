import { getTranslations } from "next-intl/server";
import { PageFrame } from "@/components/dashboard/PageFrame";
import { setChannelAction } from "@/modules/marathons/daily/actions";
import type { DailyMarathon } from "@/modules/marathons/daily/store";
import css from "./marathon.module.css";

export async function MarathonChannel({
  marathon,
  prompt,
  siteLabel,
  telegramLabel,
}: {
  marathon: DailyMarathon;
  prompt: string;
  siteLabel: string;
  telegramLabel: string;
}) {
  const t = await getTranslations("Marathon");
  return (
    <div className={css.narrow}>
      <PageFrame kicker={t("kicker")} title={t("channelTitle")} lead={marathon.title}>
        <form action={setChannelAction} className={css.stack}>
          <input type="hidden" name="slug" value={marathon.slug} />
          <p className={css.lead}>{prompt}</p>
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
      </PageFrame>
    </div>
  );
}
