"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { useState } from "react";
import { PageFrame, PagePanel } from "@/components/dashboard/PageFrame";
import { MathText } from "@/components/ui/MathText";
import type {
  WorkbookProblem,
  WorkbookTheme,
} from "@/modules/testing/getProblems";
import css from "./ProblemsWorkbook.module.css";

type ProblemsWorkbookProps = {
  themes: WorkbookTheme[];
  themeId: number;
  problems: WorkbookProblem[];
};

export function ProblemsWorkbook({
  themes,
  themeId,
  problems,
}: ProblemsWorkbookProps) {
  const t = useTranslations("ProblemsWorkbook");
  const router = useRouter();
  const [showOptions, setShowOptions] = useState(true);
  const [showKey, setShowKey] = useState(false);

  const selected = themes.find((theme) => theme.id === themeId);

  return (
    <PageFrame kicker={t("kicker")} title={t("title")} lead={t("lead")}>
      <PagePanel className={css.panel}>
        <form
          className={css.toolbar}
          action="/problems"
          onSubmit={(event) => event.preventDefault()}
        >
          <label className={css.field}>
            <span className={css.label}>{t("selectTopic")}</span>
            <select
              className={css.select}
              name="theme"
              value={themeId}
              onChange={(event) => {
                router.replace(`/problems?theme=${event.target.value}`);
              }}
              aria-label={t("selectTopic")}
            >
              {themes.map((theme, index) => (
                <option key={theme.id} value={theme.id}>
                  {index + 1}. {theme.name}
                </option>
              ))}
            </select>
          </label>

          <div className={css.actions} role="group" aria-label={t("displayAria")}>
            <button
              type="button"
              className={clsx(css.ghost, !showOptions && css.ghostActive)}
              onClick={() => setShowOptions(false)}
            >
              {t("hideOptions")}
            </button>
            <button
              type="button"
              className={clsx(css.ghost, showOptions && css.ghostActive)}
              onClick={() => setShowOptions(true)}
            >
              {t("showOptions")}
            </button>
            <button
              type="button"
              className={clsx(css.ghost, showKey && css.ghostActive)}
              onClick={() => setShowKey((open) => !open)}
              aria-pressed={showKey}
            >
              {t("toggleKey")}
            </button>
            <button
              type="button"
              className={css.print}
              onClick={() => window.print()}
            >
              {t("print")}
            </button>
          </div>
        </form>

        <p className={css.meta}>
          {t("sheetMeta", {
            theme: selected?.name ?? "",
            count: problems.length,
          })}
        </p>

        <div className={css.tableWrap}>
          <table
            className={clsx(
              css.table,
              !showOptions && css.hideOptions,
              showKey && css.showKey,
            )}
          >
            <caption className={css.caption}>
              {selected?.name} — {t("caption", { count: problems.length })}
            </caption>
            <thead>
              <tr>
                <th scope="col">{t("colPrompt")}</th>
                <th scope="col">{t("colA")}</th>
                <th scope="col">{t("colB")}</th>
                <th scope="col">{t("colC")}</th>
                <th scope="col">{t("colD")}</th>
                <th scope="col">{t("colKey")}</th>
              </tr>
            </thead>
            <tbody>
              {problems.map((problem) => (
                <tr key={problem.id}>
                  <th scope="row">
                    <MathText text={problem.problemText} />
                  </th>
                  {problem.answers.map((answer, index) => {
                    const n = (index + 1) as 1 | 2 | 3 | 4;
                    const isCorrect = n === problem.rightAnswerN;
                    return (
                      <td
                        key={n}
                        className={clsx(css.option, isCorrect && css.correct)}
                      >
                        <MathText text={answer} />
                      </td>
                    );
                  })}
                  <td className={css.keyCell}>{problem.rightAnswerN}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PagePanel>
    </PageFrame>
  );
}
