"use client";

import { useTranslations } from "next-intl";
import { useActionState, useState } from "react";
import clsx from "clsx";
import { PagePanel, PageSection } from "@/components/dashboard/PageFrame";
import { ModeTabs } from "@/components/ui/ModeTabs";
import {
  contentImportAction,
  type ContentImportActionState,
} from "@/modules/content-import/actions";
import css from "./ContentImportForm.module.css";

const INITIAL_STATE: ContentImportActionState = { status: "idle" };

type ImportMode = "csv" | "json";

type ContentImportFormProps = {
  importEnabled: boolean;
};

/** Browser UI for CSV/JSON content import via a Server Action. */
export function ContentImportForm({ importEnabled }: ContentImportFormProps) {
  const t = useTranslations("ContentImportForm");
  const [mode, setMode] = useState<ImportMode>("csv");
  const [state, formAction, pending] = useActionState(
    contentImportAction,
    INITIAL_STATE,
  );

  const importModeOptions = [
    { id: "csv" as const, label: t("modes.csv") },
    { id: "json" as const, label: t("modes.json") },
  ];

  const disabled = !importEnabled || pending;
  const showUnauthorized = !importEnabled || state.status === "unauthorized";

  return (
    <PageSection id="content-import-title" title={t("title")} lead={t("lead")}>
      {showUnauthorized ? (
        <p className={clsx(css.alert, css.alertError)} role="alert">
          {t("unavailable")} <code>CONTENT_IMPORT_API_KEY</code>.
        </p>
      ) : null}

      {state.status === "error" ? (
        <div className={clsx(css.alert, css.alertError)} role="alert">
          <p className={css.hint}>{t("validationErrors")}</p>
          <ul className={css.errorList}>
            {state.errors.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {state.status === "success" ? (
        <div className={clsx(css.alert, css.alertSuccess)} role="status">
          <p>{t("success")}</p>
          <dl className={css.summary}>
            <div>
              <dt>{t("inserted")}</dt>
              <dd>
                {t("counts", {
                  themes: state.inserted.themes,
                  connections: state.inserted.themeConnections,
                  tasks: state.inserted.quizTasks,
                  problems: state.inserted.problems,
                })}{" "}
                ({t("total", { count: state.totalInserted })})
              </dd>
            </div>
            <div>
              <dt>{t("updated")}</dt>
              <dd>
                {t("counts", {
                  themes: state.updated.themes,
                  connections: state.updated.themeConnections,
                  tasks: state.updated.quizTasks,
                  problems: state.updated.problems,
                })}{" "}
                ({t("total", { count: state.totalUpdated })})
              </dd>
            </div>
          </dl>
        </div>
      ) : null}

      <PagePanel>
        <ModeTabs
          value={mode}
          onChange={setMode}
          options={importModeOptions}
          disabled={disabled}
          ariaLabel={t("formatAria")}
        />

        {mode === "csv" ? (
          <form action={formAction} className={css.formBody}>
            <div className={css.field}>
              <label className={css.label} htmlFor="import-themes">
                themes.csv
              </label>
              <p className={css.hint}>{t("themesColumns")}</p>
              <input
                id="import-themes"
                className={css.fileInput}
                type="file"
                name="themes"
                accept=".csv,text/csv"
                required
                disabled={disabled}
              />
            </div>
            <div className={css.field}>
              <label className={css.label} htmlFor="import-theme-connections">
                theme_connections.csv
              </label>
              <p className={css.hint}>{t("connectionsColumns")}</p>
              <input
                id="import-theme-connections"
                className={css.fileInput}
                type="file"
                name="themeConnections"
                accept=".csv,text/csv"
                required
                disabled={disabled}
              />
            </div>
            <div className={css.field}>
              <label className={css.label} htmlFor="import-quiz-tasks">
                quiz_tasks.csv
              </label>
              <p className={css.hint}>{t("tasksColumns")}</p>
              <input
                id="import-quiz-tasks"
                className={css.fileInput}
                type="file"
                name="quizTasks"
                accept=".csv,text/csv"
                required
                disabled={disabled}
              />
            </div>
            <div className={css.field}>
              <label className={css.label} htmlFor="import-problems">
                problems.csv
              </label>
              <p className={css.hint}>{t("problemsColumns")}</p>
              <input
                id="import-problems"
                className={css.fileInput}
                type="file"
                name="problems"
                accept=".csv,text/csv"
                disabled={disabled}
              />
            </div>
            <button type="submit" className={css.submit} disabled={disabled}>
              {pending ? t("importing") : t("importCsv")}
            </button>
          </form>
        ) : (
          <form action={formAction} className={css.formBody}>
            <input type="hidden" name="format" value="json" />
            <div className={css.field}>
              <label className={css.label} htmlFor="import-json">
                import.json
              </label>
              <p className={css.hint}>{t("jsonHint")}</p>
              <input
                id="import-json"
                className={css.fileInput}
                type="file"
                name="file"
                accept=".json,application/json"
                required
                disabled={disabled}
              />
            </div>
            <button type="submit" className={css.submit} disabled={disabled}>
              {pending ? t("importing") : t("importJson")}
            </button>
          </form>
        )}
      </PagePanel>
    </PageSection>
  );
}
