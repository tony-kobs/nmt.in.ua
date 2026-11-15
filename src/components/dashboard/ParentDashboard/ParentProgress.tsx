import { getTranslations } from "next-intl/server";
import { PagePanel, PageSection } from "@/components/dashboard/PageFrame";
import { RecentResults } from "@/components/dashboard/RecentResults";
import { TopicResultsTable } from "@/components/dashboard/TopicResultsTable";
import { formatPercent } from "@/modules/results/types";
import type { ChildProgress } from "@/modules/parent-students/buildChildProgress";
import css from "./ParentProgress.module.css";

export async function ParentProgress({ progress }: { progress: ChildProgress }) {
  const t = await getTranslations("ParentDashboard");
  const { summary } = progress;
  const childId = String(progress.child.id);
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
      <TopicResultsTable
        rows={progress.topics}
        readOnly
        headingLevel="h2"
        title={t("topics")}
        lead={t("topicsLead")}
        hint={t("topicsHint")}
        pathname="/parent"
        queryParams={{ childId }}
      />
      <RecentResults items={progress.recentResults.map((result) => ({
        sessionId: result.sessionId, topic: result.themeName,
        score: result.correctPercent === null ? null : Math.round(result.correctPercent),
        startedAt: result.startedAt,
      }))} />
    </>
  );
}
