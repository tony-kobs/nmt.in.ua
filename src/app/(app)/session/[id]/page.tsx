import { notFound } from "next/navigation";
import { TopicTrainer } from "@/components/testing/TopicTrainer";
import { NmtTrainer } from "@/components/testing/NmtTrainer";
import { createPageMetadata } from "@/constants/seo";
import {
  recommendFromSessionMistakes,
  recommendNextActionsForStats,
  buildPracticeResultInsight,
} from "@/modules/recommendations";
import { getStudentTopicStats } from "@/modules/recommendations/getStudentTopicStats";
import { requireSessionUserId } from "@/modules/auth/getCurrentUser";
import { SESSION_STATUS_COMPLETED } from "@/modules/sessions/types";
import {
  getSessionTasks,
  GetSessionTasksError,
} from "@/modules/testing/getSessionTasks";
import { getSessionMistakeReview } from "@/modules/testing/getSessionMistakeReview";
import {
  startPlannedSession,
  StartPlannedSessionError,
} from "@/modules/testing/startPlannedSession";
import { parseTopicTestMode } from "@/modules/testing/topicTestMode";
import type { SessionTasksResult } from "@/modules/testing/types";
import { getTranslations } from "next-intl/server";

type SessionPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string | string[] }>;
};

export async function generateMetadata({ params }: SessionPageProps) {
  const { id } = await params;
  const t = await getTranslations("Metadata.session");

  return createPageMetadata({
    title: t("title"),
    description: t("description"),
    path: `/session/${id}`,
    noIndex: true,
  });
}

function readModeParam(raw: string | string[] | undefined): string | undefined {
  if (Array.isArray(raw)) return raw[0];
  return raw;
}

async function loadSession(
  sessionId: number,
  userId: number,
): Promise<SessionTasksResult> {
  try {
    return await getSessionTasks(sessionId, userId);
  } catch (error) {
    if (
      error instanceof GetSessionTasksError &&
      (error.code === "session_not_found" || error.code === "invalid_input")
    ) {
      notFound();
    }
    throw error;
  }
}

async function activatePlannedSession(
  sessionId: number,
  userId: number,
): Promise<void> {
  try {
    await startPlannedSession({ sessionId, userId });
  } catch (error) {
    if (error instanceof StartPlannedSessionError) {
      if (error.code === "not_found" || error.code === "invalid_input") {
        notFound();
      }
      if (error.code === "insufficient_tasks") {
        throw error;
      }
    }
    throw error;
  }
}

export default async function SessionPage({
  params,
  searchParams,
}: SessionPageProps) {
  const { id } = await params;
  const query = await searchParams;

  const sessionId = Number(id);

  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    notFound();
  }

  const rawMode = readModeParam(query.mode);

  const isNmt = rawMode === "nmt";
  const mode = parseTopicTestMode(rawMode);

  const userId = await requireSessionUserId();

  const t = await getTranslations("Recommendations");

  let session = await loadSession(sessionId, userId);

  if (session.isPlannedWithoutTasks) {
    await activatePlannedSession(sessionId, userId);
    session = await loadSession(sessionId, userId);
  }

  const isNmtSession =
    isNmt || session.tasks.some((task) => Boolean(task.taskKind));

  const completed =
    session.sessionStatus === SESSION_STATUS_COMPLETED && session.summary;

  const initialMistakes = completed
    ? await getSessionMistakeReview(sessionId, userId)
    : [];

  const topicStats = completed ? await getStudentTopicStats(userId) : null;
  const fromMistakes = recommendFromSessionMistakes(initialMistakes, t);
  const initialRecommendations = completed
    ? fromMistakes.length > 0
      ? fromMistakes
      : await recommendNextActionsForStats(topicStats!, t)
    : [];
  const initialInsight =
    completed && session.summary && topicStats
      ? buildPracticeResultInsight({
          summary: session.summary,
          mistakes: initialMistakes,
          topicStats,
        })
      : null;

  return isNmtSession ? (
    <NmtTrainer
      sessionId={sessionId}
      tasks={session.tasks}
      initialSummary={session.summary}
      initialRecommendations={initialRecommendations}
      initialMistakes={initialMistakes}
    />
  ) : (
    <TopicTrainer
      sessionId={sessionId}
      themeCode={session.themeCode}
      themeName={session.themeName}
      tasks={session.tasks}
      initialSummary={session.summary}
      initialRecommendations={initialRecommendations}
      initialInsight={initialInsight}
      mode={mode}
    />
  );
}
