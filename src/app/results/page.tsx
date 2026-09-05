import { PostTestFeedbackPrompt } from "@/components/feedback/FeedbackDialog";
import { RecommendedActionsPanel } from "@/components/dashboard/RecommendedActionsPanel";
import { TopicResultsTable } from "@/components/dashboard/TopicResultsTable";
import { getNavItem } from "@/constants/navigation";
import { createPageMetadata } from "@/constants/seo";
import { requireUserId } from "@/modules/auth/getCurrentUser";
import { getStudentTopicStats } from "@/modules/recommendations/getStudentTopicStats";
import { recommendNextActionsForStats } from "@/modules/recommendations";
import { getTopicResults } from "@/modules/results/getTopicResults";
import { getTranslations } from "next-intl/server";
const item = getNavItem("/results");

export const metadata = createPageMetadata({
  title: item.label,
  description: item.description,
  path: item.href,
});

type ResultsPageProps = {
  searchParams: Promise<{ sessionId?: string | string[] }>;
};

function readSessionId(
  raw: string | string[] | undefined,
): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

export default async function ResultsPage({ searchParams }: ResultsPageProps) {
  const userId = await requireUserId();
  const t = await getTranslations("Recommendations");
  const params = await searchParams;
  const finishedSessionId = readSessionId(params.sessionId);

  const [rows, topicStats] = await Promise.all([
    getTopicResults(userId),
    getStudentTopicStats(userId),
  ]);

  const actions = await recommendNextActionsForStats(topicStats, t);

  return (
    <>
      <TopicResultsTable rows={rows} />
      <RecommendedActionsPanel actions={actions} />
      {finishedSessionId ? (
        <PostTestFeedbackPrompt sessionId={finishedSessionId} />
      ) : null}
    </>
  );
}
