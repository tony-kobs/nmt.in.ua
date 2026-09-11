"use client";

import { useTranslations } from "next-intl";
import { PostTestFeedbackPrompt } from "@/components/feedback/FeedbackDialog";
import { TopicTrainerMistakeReview } from "@/components/testing/TopicTrainerMistakeReview";
import type { SessionMistakeItem } from "@/modules/testing/getSessionMistakeReview";
import { RecommendedActionsPanel } from "@/components/dashboard/RecommendedActionsPanel";
import { formatPercent } from "@/modules/results/types";
import type { PracticeResultInsight, RecommendedAction } from "@/modules/recommendations";
import { formatDurationSeconds } from "@/modules/sessions/types";
import { isPracticeMode } from "@/modules/testing/sessionMode";
import type { TrainerMode, TrainerSessionSummary } from "@/modules/testing/types";
import Link from "next/link";
import css from "./TopicTrainerSummary.module.css";

type TopicTrainerSummaryProps = {
  summary: TrainerSessionSummary;
  recommendations?: RecommendedAction[];
  /** Went-well/needs-attention breakdown — only rendered for Practice mode
   * (`isPracticeMode`); ignored for Ultimate/NMT/diagnostic, which keep
   * their existing summaries. */
  insight?: PracticeResultInsight | null;
  mode?: TrainerMode;
  timedOut?: boolean;
  mistakes?: SessionMistakeItem[];
  /** Guest-owned diagnostic attempt — shows the "save progress" CTA. */
  isGuest?: boolean;
};

export function TopicTrainerSummary({
  summary,
  recommendations = [],
  insight = null,
  mode = "standard",
  timedOut = false,
  mistakes = [],
  isGuest = false,
}: TopicTrainerSummaryProps) {
  const t = useTranslations("TopicTrainerSummary");
  const isUltimate = mode === "ultimate";
  const isDiagnostic = mode === "diagnostic";
  const isNmt = mode === "nmt";
  const isPractice = isPracticeMode(mode);
  const showMistakes =
    (isUltimate || isNmt) && mistakes.length > 0;
  const showInsight =
    isPractice &&
    insight !== null &&
    (insight.strongThemes.length > 0 || insight.weakThemes.length > 0);

  return (
    <section className={css.summary} aria-labelledby="trainer-summary-title">
      <header className={css.intro}>
        <h1 id="trainer-summary-title" className={css.title}>
          {isUltimate
            ? t("ultimateTitle")
            : isDiagnostic
              ? t("diagnosticTitle")
              : isNmt
                ? t("nmtTitle")
                : t("title")}
        </h1>
        <p className={css.lead}>
          {isDiagnostic
            ? t("diagnosticSummary", { sessionId: summary.sessionId })
            : isNmt
              ? t("nmtSummary", {
                  theme: summary.themeName,
                  sessionId: summary.sessionId,
                })
              : t.rich("summary", {
                  theme: summary.themeName,
                  sessionId: summary.sessionId,
                  themeLink: (children) =>
                    summary.themeCode ? (
                      <Link
                        href={`/materials/textbook?topic=${encodeURIComponent(summary.themeCode)}`}
                        className={css.themeLink}
                      >
                        {children}
                      </Link>
                    ) : (
                      children
                    ),
                })}
          {isUltimate || isNmt ? (
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

      {showMistakes ? (
        <TopicTrainerMistakeReview
          mistakes={mistakes}
          title={t("mistakeReview", { count: mistakes.length })}
          showThemeLinks={isNmt}
        />
      ) : null}

      {showInsight && insight ? (
        <div className={css.insight}>
          {insight.weakThemes.length > 0 ? (
            <section
              className={css.insightPanel}
              aria-labelledby="practice-needs-attention-title"
            >
              <h2 id="practice-needs-attention-title" className={css.insightTitle}>
                {t("needsAttentionTitle")}
              </h2>
              <ul className={css.insightList}>
                {insight.weakThemes.map((theme) => (
                  <li key={theme.themeId} className={css.insightItem}>
                    {t("needsAttentionItem", {
                      theme: theme.themeName,
                      count: theme.mistakeCount,
                    })}
                  </li>
                ))}
              </ul>
              {insight.hasRepeatedMistakes ? (
                <p className={css.insightNote}>{t("repeatedMistakesNote")}</p>
              ) : null}
            </section>
          ) : null}

          {insight.strongThemes.length > 0 ? (
            <section
              className={css.insightPanel}
              aria-labelledby="practice-went-well-title"
            >
              <h2 id="practice-went-well-title" className={css.insightTitle}>
                {t("wentWellTitle")}
              </h2>
              <ul className={css.insightList}>
                {insight.strongThemes.map((theme) => (
                  <li key={theme.themeId} className={css.insightItem}>
                    {t("wentWellItem", {
                      theme: theme.themeName,
                      percent: theme.percent,
                    })}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}

      {isDiagnostic ? null : (
        <RecommendedActionsPanel
          actions={recommendations}
          title={t("recommendationsTitle")}
          lead={
            isNmt ? t("nmtRecommendationsLead") : t("recommendationsLead")
          }
          className={css.recommendations}
        />
      )}

      <nav className={css.links} aria-label={t("nextSteps")}>
        {isDiagnostic && isGuest ? (
          <Link href="/register?from=diagnostic" className={css.primary}>
            {t("saveDiagnosticProgress")}
          </Link>
        ) : (
          <>
            <Link href="/results" className={css.primary}>
              {t("results")}
            </Link>

            <Link href="/sessions" className={css.secondary}>
              {t("sessions")}
            </Link>
          </>
        )}

        <Link href={isNmt ? "/simulator" : "/"} className={css.secondary}>
          {isNmt ? t("newNmt") : t("newTest")}
        </Link>
      </nav>

      <PostTestFeedbackPrompt sessionId={summary.sessionId} isGuest={isGuest} />
    </section>
  );
}
