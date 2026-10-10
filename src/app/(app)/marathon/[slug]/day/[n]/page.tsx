import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { MarathonDayView } from "@/components/marathon/MarathonDayView";
import { createPageMetadata } from "@/constants/seo";
import { requireUser } from "@/modules/auth/getCurrentUser";
import { evaluateDayAccess } from "@/modules/marathons/daily/calendar";
import { renderResolved } from "@/modules/marathons/daily/copy";
import { rankNoticeText } from "@/modules/marathons/daily/leaderboard";
import { dayClientPayload } from "@/modules/marathons/daily/playTasks";
import {
  getDailyBySlug,
  getParticipant,
  listDays,
  listMaterials,
  listPendingTasks,
  listProgress,
  listTaskReview,
  loadMarathonBoard,
  loadMarathonCopy,
} from "@/modules/marathons/daily/store";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string; n: string }>;
  searchParams: Promise<{ error?: string | string[] }>;
};

export async function generateMetadata({ params }: PageProps) {
  const { slug, n } = await params;
  const t = await getTranslations("Metadata.marathonDay");
  return createPageMetadata({
    title: t("title", { n }),
    description: t("description"),
    path: `/marathon/${slug}/day/${n}`,
    noIndex: true,
  });
}

export default async function MarathonDayPage({ params, searchParams }: PageProps) {
  const user = await requireUser();
  const { slug, n } = await params;
  const dayNumber = Number(n);
  const marathon = await getDailyBySlug(slug);
  if (!marathon || marathon.status === "draft") notFound();
  const participant = await getParticipant(marathon.id, user.id);
  if (!participant) notFound();
  const access = evaluateDayAccess({
    now: new Date(),
    startDate: marathon.startDate,
    unlockHour: marathon.unlockHour,
    daysCount: marathon.daysCount,
    dayNumber,
  });
  if (!access.open && access.code === "invalid_day") notFound();
  const day = (await listDays(marathon.id)).find((item) => item.dayNumber === dayNumber);
  if (!day) notFound();
  const query = await searchParams;
  const progress = (await listProgress(marathon.id, user.id)).find(
    (item) => item.dayNumber === dayNumber,
  );
  const open = access.open;
  const locale = await getLocale();
  const materials = open ? await listMaterials(day.id) : [];
  const submitted = progress?.completedAt != null;
  const pending =
    open && progress?.materialsViewed && !submitted
      ? await listPendingTasks(day.id)
      : [];
  const graded =
    open && submitted
      ? await listTaskReview(day.id, progress?.answers ?? {})
      : [];
  const payload = dayClientPayload({
    submitted,
    pending,
    review: graded,
  });
  const [copy, board] = await Promise.all([
    loadMarathonCopy(marathon.id),
    loadMarathonBoard(marathon.id),
  ]);
  const reviewIntro = renderResolved("review_intro", copy, {
    name: user.displayName,
    day: day.dayNumber,
    topic: day.topic,
  });
  const self = board.find((row) => row.userId === user.id) ?? null;
  const rankNote = submitted && self
    ? rankNoticeText(copy, {
        name: participant.displayName || user.displayName,
        place: self.place,
        prevPlace: self.prevPlace,
        points: self.points,
        day: day.dayNumber,
      })
    : null;
  return (
    <MarathonDayView
      marathon={marathon}
      day={day}
      materials={materials}
      tasks={payload.tasks}
      review={payload.review}
      progress={progress}
      reviewIntro={reviewIntro}
      rankNote={rankNote}
      board={board}
      selfId={user.id}
      lockedUntil={open ? null : access.unlockAt}
      locale={locale}
      error={Array.isArray(query.error) ? query.error[0] : query.error}
    />
  );
}
