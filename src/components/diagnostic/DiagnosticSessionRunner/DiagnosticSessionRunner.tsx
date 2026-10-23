"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { TopicTrainer } from "@/components/testing/TopicTrainer";
import {
  advanceDiagnosticAction,
  checkDiagnosticAnswerAction,
  finishDiagnosticSessionAction,
  getDiagnosticThemeBreakdownAction,
  getDiagnosticAnswerReviewAction,
  markDiagnosticSessionStartedAction,
} from "@/modules/diagnostic/actions";
import type { SessionTask } from "@/modules/testing/types";

const DIAGNOSTIC_ACTIONS = {
  checkAnswer: checkDiagnosticAnswerAction,
  finishTrainerSession: finishDiagnosticSessionAction,
  markSessionStarted: markDiagnosticSessionStartedAction,
};

type DiagnosticSessionRunnerProps = {
  sessionId: number;
  themeCode: string | null;
  themeName: string;
  tasks: SessionTask[];
  isGuest: boolean;
  initialIndex: number;
  progressTotal: number;
  /** From `getDiagnosticNextStep`: whether answering the last listed task
   * may be followed by another task/topic (`true`) or is final (`false`). */
  continueAfterLast: boolean;
  /** When the attempt stays on the intro page, reload tasks here instead of
   * refreshing a separate session route. */
  onReload?: () => Promise<boolean>;
  /** Cards sit inside the intro layout, so the trainer skips its page title. */
  embed?: boolean;
};

/**
 * In-progress adaptive diagnostic attempt. The trainer itself is the shared
 * `TopicTrainer` in diagnostic mode; this wrapper only adds the "what comes
 * next" step: after the latest task is answered it asks the server to link
 * the next adaptive task, then re-reads the page. Keyed by the latest mapping
 * so a newly linked task remounts the trainer on it.
 */
export function DiagnosticSessionRunner({
  sessionId,
  themeCode,
  themeName,
  tasks,
  isGuest,
  initialIndex,
  progressTotal,
  continueAfterLast,
  onReload,
  embed = false,
}: DiagnosticSessionRunnerProps) {
  const router = useRouter();

  const handleContinue = useCallback(async () => {
    const result = await advanceDiagnosticAction({ sessionId });
    if (result.status !== "success") return "error" as const;
    if (result.next === "complete") return "finish" as const;
    if (onReload) {
      const ok = await onReload();
      if (!ok) return "error" as const;
    } else {
      router.refresh();
    }
    return "continue" as const;
  }, [onReload, router, sessionId]);

  return (
    <TopicTrainer
      key={tasks.at(-1)?.mappingId ?? 0}
      sessionId={sessionId}
      themeCode={themeCode}
      themeName={themeName}
      tasks={tasks}
      initialRecommendations={[]}
      mode="diagnostic"
      isGuest={isGuest}
      actions={DIAGNOSTIC_ACTIONS}
      diagnosticThemeBreakdownAction={getDiagnosticThemeBreakdownAction}
      diagnosticAnswerReviewAction={getDiagnosticAnswerReviewAction}
      initialIndex={initialIndex}
      progressTotal={progressTotal}
      onContinue={continueAfterLast ? handleContinue : undefined}
      embed={embed}
    />
  );
}
