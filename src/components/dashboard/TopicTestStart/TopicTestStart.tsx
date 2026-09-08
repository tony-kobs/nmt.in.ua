"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageFrame, PagePanel } from "@/components/dashboard/PageFrame";
import {
  startTopicTestAction,
  type StartTopicTestActionState,
} from "@/modules/testing/actions";
import {
  parseThemeQueryParam,
  resolveInitialThemeId,
} from "@/modules/testing/parseThemeQueryParam";
import { TOPIC_TEST_TASK_COUNT } from "@/modules/testing/topicTestMode";
import type { AvailableTopicTheme } from "@/modules/testing/types";
import css from "./TopicTestStart.module.css";

const INITIAL_STATE: StartTopicTestActionState = { status: "idle" };

function formatThemeLabel(index: number, theme: AvailableTopicTheme): string {
  return `${index + 1}. ${theme.name}`;
}

function suggestedCount(bankSize: number): number {
  if (bankSize <= 0) return 1;
  return Math.min(TOPIC_TEST_TASK_COUNT, bankSize);
}

type TopicTestStartProps = {
  themes: AvailableTopicTheme[];
  initialThemeId?: number;
  displayName: string;
};

/** “Тест за обраною темою” — тема + кількість завдань з банку. */
export function TopicTestStart({
  themes,
  initialThemeId,
  displayName,
}: TopicTestStartProps) {
  const t = useTranslations("TopicTestStart");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, formAction, pending] = useActionState(
    startTopicTestAction,
    INITIAL_STATE,
  );

  useEffect(() => {
    if (state.status === "success") {
      router.replace(`/session/${state.sessionId}`);
    }
  }, [state, router]);

  const isRedirecting = state.status === "success";
  const hasThemes = themes.length > 0;
  const themeIds = themes.map((theme) => theme.id);
  const urlThemeId = parseThemeQueryParam(searchParams.get("theme"));
  const derivedThemeId = resolveInitialThemeId(
    themeIds,
    urlThemeId ?? initialThemeId,
  );
  const [overrideThemeId, setOverrideThemeId] = useState<number | null>(null);
  const selectedThemeId = overrideThemeId ?? derivedThemeId ?? themeIds[0] ?? 0;

  const selectedTheme =
    themes.find((theme) => theme.id === selectedThemeId) ?? themes[0];
  const bankSize = selectedTheme?.taskCount ?? 0;
  const controlsDisabled = pending || isRedirecting;

  const [taskCountInput, setTaskCountInput] = useState(() =>
    String(suggestedCount(themes[0]?.taskCount ?? 0)),
  );
  const parsedCount = Number(taskCountInput);
  if (bankSize > 0 && Number.isInteger(parsedCount) && parsedCount > bankSize) {
    setTaskCountInput(String(bankSize));
  }

  const countValid =
    Number.isInteger(parsedCount) &&
    parsedCount >= 1 &&
    parsedCount <= bankSize;

  return (
    <PageFrame
      className={css.frame}
      title={
        <>
          {t("helloStart")} <span className={css.accent}>{displayName}</span>
        </>
      }
      lead={t("lead")}
    >
      {!hasThemes ? (
        <p className={css.error} role="status">
          {t("noThemes")}
        </p>
      ) : (
        <PagePanel>
          <h2 className={css.formTitle}>{t("formTitle")}</h2>
          <form className={css.controls} action={formAction}>
            <div className={css.fields}>
              <label className={css.field}>
                <span className={css.label}>{t("selectTopic")}</span>
                <select
                  className={css.select}
                  name="themeId"
                  value={selectedThemeId}
                  onChange={(event) =>
                    setOverrideThemeId(Number(event.currentTarget.value))
                  }
                  disabled={controlsDisabled}
                >
                  {themes.map((theme, index) => (
                    <option key={theme.id} value={theme.id}>
                      {formatThemeLabel(index, theme)}
                    </option>
                  ))}
                </select>
              </label>

              <div className={css.fieldCount}>
                <span className={css.label} id="topic-task-count-label">
                  {t("tasks")}
                </span>
                <div
                  className={css.countWrap}
                  aria-labelledby="topic-task-count-label"
                >
                  <input
                    className={css.countInput}
                    type="number"
                    name="taskCount"
                    inputMode="numeric"
                    min={1}
                    max={Math.max(bankSize, 1)}
                    step={1}
                    value={taskCountInput}
                    onChange={(event) =>
                      setTaskCountInput(event.currentTarget.value)
                    }
                    disabled={controlsDisabled || bankSize === 0}
                    aria-label={t("taskCountAria", {
                      count: countValid ? parsedCount : 0,
                      total: bankSize,
                    })}
                    autoComplete="off"
                  />
                  <span className={css.countSlash} aria-hidden>
                    /
                  </span>
                  <span className={css.countTotal}>{bankSize}</span>
                </div>
                <span className={css.hint}>
                  {t("tasksHint", { total: bankSize })}
                </span>
              </div>
            </div>

            <button
              type="submit"
              className={css.start}
              disabled={controlsDisabled || !countValid}
            >
              {isRedirecting
                ? t("redirecting")
                : pending
                  ? t("loading")
                  : t("start")}
            </button>
          </form>
        </PagePanel>
      )}

      {state.status === "error" ? (
        <p className={css.error} role="alert">
          {t(`errors.${state.code}`)}
        </p>
      ) : null}
    </PageFrame>
  );
}
