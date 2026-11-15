import { getTranslations } from "next-intl/server";
import type { TopicResultRow } from "@/modules/results/types";
import { TopicResultsTableBody } from "./TopicResultsTableBody";
import css from "./TopicResultsTable.module.css";

type TopicResultsTableProps = {
  rows: TopicResultRow[];
  /** When viewing another student's results (teacher), hide editable self-score. */
  readOnly?: boolean;
  title?: string;
  lead?: string;
  /** Only themes that already have attempts (teacher overview). */
  hideEmptyThemes?: boolean;
  /** Nested under another page heading. */
  headingLevel?: "h1" | "h2";
  page?: number;
  pathname?: string;
  queryParams?: Record<string, string | null | undefined>;
  /** Replaces the default footer hint. Parents keep the student color legend. */
  hint?: string;
};

export async function TopicResultsTable({
  rows,
  readOnly = false,
  title,
  lead,
  hideEmptyThemes = false,
  headingLevel = "h1",
  page = 1,
  pathname = "/results",
  queryParams = {},
  hint,
}: TopicResultsTableProps) {
  const t = await getTranslations("TopicResultsTable");
  const visible = hideEmptyThemes
    ? rows.filter((row) => row.attemptsCount > 0)
    : rows;
  const TitleTag = headingLevel === "h2" ? "h2" : "h1";

  return (
    <section className={css.topicResults} aria-labelledby="topic-results-title">
      <header className={css.intro}>
        <TitleTag id="topic-results-title" className={css.title}>
          {title ?? t("title")}
        </TitleTag>

        <p className={css.lead}>{lead ?? t("lead")}</p>
      </header>

      {visible.length === 0 ? (
        <p className={css.hint} role="status">
          {t("emptyAttempts")}
        </p>
      ) : (
        <TopicResultsTableBody
          rows={visible}
          readOnly={readOnly}
          page={page}
          pathname={pathname}
          queryParams={queryParams}
        />
      )}

      <p className={css.hint}>{hint ?? (readOnly ? t("hintTeacher") : t("hint"))}</p>
    </section>
  );
}
