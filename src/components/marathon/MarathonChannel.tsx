import { getTranslations } from "next-intl/server";
import { PageFrame } from "@/components/dashboard/PageFrame";
import type { DailyMarathon } from "@/modules/marathons/daily/store";
import { DeliveryToggles } from "./DeliveryToggles";
import css from "./marathon.module.css";

export async function MarathonChannel({
  marathon,
  prompt,
  telegramLinked,
  telegramUsername,
  botReady,
}: {
  marathon: DailyMarathon;
  prompt: string;
  telegramLinked: boolean;
  telegramUsername: string | null;
  botReady: boolean;
}) {
  const t = await getTranslations("Marathon");
  return (
    <div className={css.narrow}>
      <PageFrame kicker={t("kicker")} title={t("channelTitle")} lead={marathon.title}>
        <DeliveryToggles
          slug={marathon.slug}
          prompt={prompt}
          emailOn
          telegramOn
          telegramLinked={telegramLinked}
          telegramUsername={telegramUsername}
          botReady={botReady}
        />
      </PageFrame>
    </div>
  );
}
