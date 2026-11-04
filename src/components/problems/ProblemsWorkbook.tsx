"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { PageFrame, PagePanel } from "@/components/dashboard/PageFrame";
import { MathText } from "@/components/ui/MathText";
import { Select } from "@/components/ui/Select";
import { ANSWER_LETTERS } from "@/constants/answerLetters";
import { queryHref } from "@/lib/queryHref";
import type {
  WorkbookProblem,
  WorkbookTheme,
} from "@/modules/testing/getProblems";
import css from "./ProblemsWorkbook.module.css";

const PROBLEM_LETTERS = ANSWER_LETTERS.slice(0, 4);

type ProblemsWorkbookProps = {
  themes: WorkbookTheme[];
  themeKey: string;
  problems: WorkbookProblem[];
  showOptions: boolean;
  showKey: boolean;
  lead: string;
};

function problemsHref(
  themeKey: string,
  showOptions: boolean,
  showKey: boolean,
): string {
  return queryHref("/problems", {
    theme: themeKey,
    options: showOptions ? null : "0",
    key: showKey ? "1" : null,
  });
}

export function ProblemsWorkbook({
  themes,
  themeKey,
  problems,
  showOptions,
  showKey,
  lead,
}: ProblemsWorkbookProps) {
  const t = useTranslations("ProblemsWorkbook");
  const router = useRouter();

  const selected = themes.find((theme) => theme.key === themeKey);

  return (
    <PageFrame kicker={t("kicker")} title={t("title")} lead={lead}>
      <PagePanel className={css.panel}>
        <form
          className={css.toolbar}
          action="/problems"
          onSubmit={(event) => event.preventDefault()}
        >
          <label className={css.field}>
            <span className={css.label}>{t("selectTopic")}</span>
            <Select
              name="theme"
              value={themeKey}
              aria-label={t("selectTopic")}
              options={themes.map((theme, index) => ({
                value: theme.key,
                label: `${index + 1}. ${theme.name}`,
              }))}
              onChange={(next) => {
                router.replace(problemsHref(next, showOptions, showKey), {
                  scroll: false,
                });
              }}
            />
          </label>

          <div className={css.actions} role="group" aria-label={t("displayAria")}>
            <button
              type="button"
              className={clsx(css.ghost, !showOptions && css.ghostActive)}
              onClick={() =>
                router.replace(problemsHref(themeKey, false, showKey), {
                  scroll: false,
                })
              }
            >
              {t("hideOptions")}
            </button>
            <button
              type="button"
              className={clsx(css.ghost, showOptions && css.ghostActive)}
              onClick={() =>
                router.replace(problemsHref(themeKey, true, showKey), {
                  scroll: false,
                })
              }
            >
              {t("showOptions")}
            </button>
            <button
              type="button"
              className={clsx(css.ghost, showKey && css.ghostActive)}
              onClick={() =>
                router.replace(problemsHref(themeKey, showOptions, !showKey), {
                  scroll: false,
                })
              }
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
                {PROBLEM_LETTERS.map((letter) => (
                  <th key={letter} scope="col">
                    {letter}
                  </th>
                ))}
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
                  <td className={css.keyCell}>
                    {PROBLEM_LETTERS[problem.rightAnswerN - 1]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PagePanel>
    </PageFrame>
  );
}
