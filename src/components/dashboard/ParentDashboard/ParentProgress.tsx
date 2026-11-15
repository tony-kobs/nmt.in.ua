import { getTranslations } from "next-intl/server";
import { PagePanel, PageSection } from "@/components/dashboard/PageFrame";
import { RecentResults } from "@/components/dashboard/RecentResults";
import { formatPercent } from "@/modules/results/types";
import type { ChildProgress } from "@/modules/parent-students/buildChildProgress";
import css from "./ParentProgress.module.css";

export async function ParentProgress({ progress }: { progress: ChildProgress }) {
  const t = await getTranslations("ParentDashboard");
  const { summary } = progress;
  return (
    <>
      <PageSection title={progress.child.displayName} id="parent-child-summary" lead={t("summaryLead")}>
        <PagePanel>
          <dl className={css.metrics}>
            {([
              ["completedTests", summary.completedSessions], ["completedTasks", summary.totalTasks],
              ["correctAnswers", summary.correctAnswers], ["correctPercent", formatPercent(summary.correctPercent)],
            ] as const).map(([key, value]) => <div key={key}><dt>{t(key)}</dt><dd>{value}</dd></div>)}
          </dl>
          {summary.completedSessions === 0 ? <p role="status">{t("noTests")}</p> : null}
        </PagePanel>
      </PageSection>
      <PageSection title={t("topics")} id="parent-child-topics" lead={t("topicsLead")}>
        <PagePanel>
          {progress.topics.length === 0 ? <p>{t("noTopics")}</p> : (
            <ul className={css.topics}>
              {progress.topics.map((topic) => <li key={topic.themeId}>
                <h3>{topic.themeName}</h3>
                <dl className={css.metrics}>
                  <div><dt>{t("completedTests")}</dt><dd>{topic.completedSessions}</dd></div>
                  <div><dt>{t("completedTasks")}</dt><dd>{topic.totalTasks}</dd></div>
                  <div><dt>{t("correctAnswers")}</dt><dd>{topic.correctAnswers}</dd></div>
                  <div><dt>{t("correctPercent")}</dt><dd>{formatPercent(topic.correctPercent)}</dd></div>
                </dl>
              </li>)}
            </ul>
          )}
        </PagePanel>
      </PageSection>
      <RecentResults items={progress.recentResults.map((result) => ({
        sessionId: result.sessionId, topic: result.themeName,
        score: result.correctPercent === null ? null : Math.round(result.correctPercent),
        startedAt: result.startedAt,
      }))} />
    </>
  );
}
