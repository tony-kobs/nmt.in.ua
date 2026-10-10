import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { MarathonChannel } from "@/components/marathon/MarathonChannel";
import { MarathonIntro } from "@/components/marathon/MarathonIntro";
import { MarathonMapView } from "@/components/marathon/MarathonMapView";
import { createPageMetadata } from "@/constants/seo";
import { requireUser } from "@/modules/auth/getCurrentUser";
import { listDayAccess } from "@/modules/marathons/daily/calendar";
import { optionalTelegramBot } from "@/modules/marathons/daily/botLink";
import { renderCopy, renderResolved, resolveCopy } from "@/modules/marathons/daily/copy";
import { renderSafeMarkdown } from "@/modules/marathons/daily/richText";
import {
  getDailyBySlug,
  getParticipant,
  listDays,
  listProgress,
  loadMarathonBoard,
  loadMarathonCopy,
} from "@/modules/marathons/daily/store";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string | string[]; panel?: string | string[] }>;
};

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params;
  const t = await getTranslations("Metadata.marathonMap");
  return createPageMetadata({
    title: t("title"),
    description: t("description"),
    path: `/marathon/${slug}/map`,
    noIndex: true,
  });
}

export default async function MarathonMapPage({ params, searchParams }: PageProps) {
  const user = await requireUser();
  const { slug } = await params;
  const query = await searchParams;
  const marathon = await getDailyBySlug(slug);
  if (!marathon || marathon.status === "draft") notFound();
  if (marathon.status !== "active" && marathon.status !== "finished") notFound();
  const [days, participant, progress, locale, copy, board] = await Promise.all([
    listDays(marathon.id),
    getParticipant(marathon.id, user.id),
    listProgress(marathon.id, user.id),
    getLocale(),
    loadMarathonCopy(marathon.id),
    loadMarathonBoard(marathon.id),
  ]);
  if (marathon.status === "active" && !participant) {
    // Stay on the map: the view offers join for an existing account.
  }
  const access = listDayAccess({
    now: new Date(),
    startDate: marathon.startDate,
    unlockHour: marathon.unlockHour,
    daysCount: marathon.daysCount,
  });
  const error = Array.isArray(query.error) ? query.error[0] : query.error;
  const panel = Array.isArray(query.panel) ? query.panel[0] : query.panel;
  const rulesHtml = renderSafeMarkdown(renderCopy(resolveCopy("intro_rules", copy), {
    name: participant?.displayName || user.displayName,
  }));
  const siteLabel = resolveCopy("bot_btn_site", copy);
  const telegramLabel = resolveCopy("bot_btn_telegram", copy);
  const channelPrompt = renderResolved("channel_prompt", copy, {
    name: participant?.displayName || user.displayName,
  });
  if (participant && !participant.introSeen) {
    return <MarathonIntro marathon={marathon} rulesHtml={rulesHtml} gate />;
  }
  if (participant && !participant.channel) {
    return (
      <MarathonChannel
        marathon={marathon}
        prompt={channelPrompt}
        siteLabel={siteLabel}
        telegramLabel={telegramLabel}
      />
    );
  }
  return (
    <>
      {participant && panel === "rules" ? (
        <MarathonIntro marathon={marathon} rulesHtml={rulesHtml} gate={false} />
      ) : null}
      <MarathonMapView
      marathon={marathon}
      participant={participant}
      locale={locale}
      botReady={Boolean(optionalTelegramBot())}
      channelPrompt={channelPrompt}
      siteLabel={siteLabel}
      telegramLabel={telegramLabel}
      error={error}
      board={board}
      days={access.map((item) => {
        const content = days.find((day) => day.dayNumber === item.dayNumber);
        return {
          dayNumber: item.dayNumber,
          topic: content?.topic ?? "",
          open: item.open && Boolean(content),
          unlockAt: item.unlockAt,
          progress: progress.find((row) => row.dayNumber === item.dayNumber),
        };
      })}
    />
    </>
  );
}
