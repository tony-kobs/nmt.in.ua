import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { MarathonFinalView } from "@/components/marathon/MarathonFinalView";
import { MarathonMapView } from "@/components/marathon/MarathonMapView";
import { createPageMetadata } from "@/constants/seo";
import { requireUser } from "@/modules/auth/getCurrentUser";
import { listDayAccess } from "@/modules/marathons/daily/calendar";
import { optionalTelegramBot } from "@/modules/marathons/daily/botLink";
import { getTelegramLinkRecord } from "@/modules/telegram/link";
import { renderCopy, renderResolved, resolveCopy } from "@/modules/marathons/daily/copy";
import { renderSafeMarkdown } from "@/modules/marathons/daily/richText";
import {
  getDailyBySlug,
  getParticipant,
  listDays,
  listProgress,
  loadMarathonCopy,
  markIntroSeen,
} from "@/modules/marathons/daily/store";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ error?: string | string[]; saved?: string | string[] }>;
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
  if (!marathon || marathon.status === "draft" || marathon.status === "archived") notFound();
  if (marathon.status !== "active" && marathon.status !== "finished") notFound();
  const [days, participant, progress, locale, copy, telegramRecord] = await Promise.all([
    listDays(marathon.id),
    getParticipant(marathon.id, user.id),
    listProgress(marathon.id, user.id),
    getLocale(),
    loadMarathonCopy(marathon.id),
    getTelegramLinkRecord(user.id).catch((error: unknown) => {
      console.error("marathon channel telegram", error);
      return null;
    }),
  ]);
  if (participant && !participant.introSeen) {
    try {
      await markIntroSeen(marathon.id, user.id, new Date());
    } catch (error) {
      console.error("marathon intro", error);
    }
  }
  const error = Array.isArray(query.error) ? query.error[0] : query.error;
  const saved = (Array.isArray(query.saved) ? query.saved[0] : query.saved) === "1";
  if (participant && marathon.status === "finished") {
    const summary = renderResolved("final_summary", copy, {
      name: participant.displayName || user.displayName,
      link: marathon.finalCtaUrl,
    });
    return (
      <MarathonFinalView
        marathon={marathon}
        days={days}
        progress={progress}
        participant={participant}
        summary={summary}
      />
    );
  }
  const access = listDayAccess({
    now: new Date(),
    startDate: marathon.startDate,
    unlockHour: marathon.unlockHour,
    daysCount: marathon.daysCount,
  });
  const rulesHtml = renderSafeMarkdown(renderCopy(resolveCopy("intro_rules", copy), {
    name: participant?.displayName || user.displayName,
  }));
  const channelPrompt = renderResolved("channel_prompt", copy, {
    name: participant?.displayName || user.displayName,
  });
  return (
    <MarathonMapView
      marathon={marathon}
      participant={participant}
      locale={locale}
      botReady={Boolean(optionalTelegramBot())}
      rulesHtml={rulesHtml}
      channelPrompt={channelPrompt}
      telegramLinked={Boolean(telegramRecord)}
      telegramUsername={telegramRecord?.username ?? null}
      error={error}
      saved={saved}
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
  );
}
