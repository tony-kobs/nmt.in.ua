import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { PageFrame } from "@/components/dashboard/PageFrame";
import { seeIntroAction } from "@/modules/marathons/daily/actions";
import { loomEmbedSrc, youtubeEmbedSrc } from "@/modules/marathons/daily/richText";
import type { DailyMarathon } from "@/modules/marathons/daily/store";
import css from "./marathon.module.css";

export async function MarathonIntro({
  marathon,
  rulesHtml,
  gate,
}: {
  marathon: DailyMarathon;
  rulesHtml: string;
  gate: boolean;
}) {
  const t = await getTranslations("Marathon");
  const video = marathon.introVideoUrl;
  const src = video ? youtubeEmbedSrc(video) ?? loomEmbedSrc(video) : null;
  return (
    <div className={css.narrow}>
      <PageFrame kicker={t("kicker")} title={t("introTitle")} lead={marathon.title}>
        <div className={css.stack}>
          {src ? (
            <div className={css.embed}>
              <iframe
                src={src}
                title={t("introTitle")}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                referrerPolicy="no-referrer"
              />
            </div>
          ) : null}
          <div
            className={`${css.card} ${css.prose}`}
            dangerouslySetInnerHTML={{ __html: rulesHtml }}
          />
          {gate ? (
            <form action={seeIntroAction}>
              <input type="hidden" name="slug" value={marathon.slug} />
              <button type="submit" className={css.button}>{t("introContinue")}</button>
            </form>
          ) : (
            <Link href={`/marathon/${marathon.slug}/map`} className={css.buttonQuiet}>
              {t("backToMap")}
            </Link>
          )}
        </div>
      </PageFrame>
    </div>
  );
}
