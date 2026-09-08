import { notFound } from "next/navigation";
import { TopicTrainer } from "@/components/testing/TopicTrainer";
import { createPageMetadata } from "@/constants/seo";
import {
  checkDiagnosticAnswerAction,
  finishDiagnosticSessionAction,
  markDiagnosticSessionStartedAction,
} from "@/modules/diagnostic/actions";
import {
  getDiagnosticSessionTasks,
  GetDiagnosticSessionTasksError,
} from "@/modules/diagnostic/getDiagnosticSessionTasks";
import { resolveOwnerForRead } from "@/modules/diagnostic/sessionOwner";
import { getTranslations } from "next-intl/server";

type DiagnosticSessionPageProps = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: DiagnosticSessionPageProps) {
  const { id } = await params;
  const t = await getTranslations("Metadata.diagnosticSession");

  return createPageMetadata({
    title: t("title"),
    description: t("description"),
    path: `/diagnostic/session/${id}`,
    noIndex: true,
  });
}

export default async function DiagnosticSessionPage({
  params,
}: DiagnosticSessionPageProps) {
  const { id } = await params;
  const sessionId = Number(id);

  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    notFound();
  }

  // Read-only: an authenticated student resolves to their own identity; a
  // guest resolves to their existing signed nmt_guest cookie, if any. Never
  // mints a new one here — a guest with no valid cookie has nothing to see.
  const owner = await resolveOwnerForRead();
  if (!owner) {
    notFound();
  }

  let session;
  try {
    session = await getDiagnosticSessionTasks(sessionId, owner);
  } catch (error) {
    if (
      error instanceof GetDiagnosticSessionTasksError &&
      (error.code === "session_not_found" || error.code === "invalid_input")
    ) {
      notFound();
    }
    throw error;
  }

  return (
    <TopicTrainer
      sessionId={sessionId}
      themeCode={session.themeCode}
      themeName={session.themeName}
      tasks={session.tasks}
      initialSummary={session.summary}
      initialRecommendations={[]}
      mode="diagnostic"
      isGuest={owner.userId === null}
      actions={{
        checkAnswer: checkDiagnosticAnswerAction,
        finishTrainerSession: finishDiagnosticSessionAction,
        markSessionStarted: markDiagnosticSessionStartedAction,
      }}
    />
  );
}
