"use client";

import { useTranslations } from "next-intl";
import { PostTestFeedbackPrompt } from "@/components/feedback/FeedbackDialog";
import { TopicTrainerMistakeReview } from "@/components/testing/TopicTrainerMistakeReview";
import type { SessionMistakeItem } from "@/modules/testing/getSessionMistakeReview";
import type { TopicTestMode } from "@/modules/testing/topicTestMode";
import { RecommendedActionsPanel } from "@/components/dashboard/RecommendedActionsPanel";
import { formatPercent } from "@/modules/results/types";
import type { RecommendedAction } from "@/modules/recommendations";
import { formatDurationSeconds } from "@/modules/sessions/types";
import type { TrainerSessionSummary } from "@/modules/testing/types";
import Link from "next/link";
import css from "./TopicTrainerSummary.module.css";

type TopicTrainerSummaryProps = {
  summary: TrainerSessionSummary;
  recommendations?: RecommendedAction[];
  mode?: TopicTestMode;
  timedOut?: boolean;
  mistakes?: SessionMistakeItem[];
};

export function TopicTrainerSummary({
  summary,
  recommendations = [],
  mode = "standard",
  timedOut = false,
  mistakes = [],
}: TopicTrainerSummaryProps) {
  const t = useTranslations("TopicTrainerSummary");
  const isUltimate = mode === "ultimate";

  return (
    <section className={css.summary} aria-labelledby="trainer-summary-title">
      <header className={css.intro}>
        <h1 id="trainer-summary-title" className={css.title}>
          {isUltimate ? t("ultimateTitle") : t("title")}
        </h1>
        <p className={css.lead}>
          {t("summary", {
            theme: summary.themeName,
            sessionId: summary.sessionId,
          })}
          {isUltimate ? (
            <>
              {" "}
              {timedOut ? t("timedOut") : t("completed")} {t("mistakesBelow")}
            </>
          ) : null}
        </p>
      </header>

      <dl className={css.stats}>
        <div className={css.stat}>
          <dt>{t("correct")}</dt>
          <dd>
            {summary.rightNumber} / {summary.tasksNumber}
          </dd>
        </div>

        <div className={css.stat}>
          <dt>{t("result")}</dt>
          <dd>{formatPercent(summary.percent)}</dd>
        </div>

        <div className={css.stat}>
          <dt>{t("time")}</dt>
          <dd>{formatDurationSeconds(summary.timeSec)}</dd>
        </div>
      </dl>

      {isUltimate && mistakes.length > 0 ? (
        <TopicTrainerMistakeReview
          mistakes={mistakes}
          title={t("mistakeReview", { count: mistakes.length })}
        />
      ) : null}

      <RecommendedActionsPanel
        actions={recommendations}
        title={t("recommendationsTitle")}
        lead={t("recommendationsLead")}
        className={css.recommendations}
      />

      <nav className={css.links} aria-label={t("nextSteps")}>
        <Link href="/results" className={css.primary}>
          {t("results")}
        </Link>

        <Link href="/sessions" className={css.secondary}>
          {t("sessions")}
        </Link>

        <Link href="/" className={css.secondary}>
          {t("newTest")}
        </Link>
      </nav>

      <PostTestFeedbackPrompt sessionId={summary.sessionId} />
    </section>
  );
}
