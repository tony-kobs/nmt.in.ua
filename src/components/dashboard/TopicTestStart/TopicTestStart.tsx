"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { PageFrame, PagePanel } from "@/components/dashboard/PageFrame";
import { InteractiveFormatsShowcase } from "@/components/practice/InteractiveFormatsShowcase";
import { Select } from "@/components/ui/Select";
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
import clsx from "clsx";
import css from "./TopicTestStart.module.css";

/** `?tab=interactive` opens the interactive formats tab (legacy `/practice/interactive` redirects here). */
const INTERACTIVE_TAB_PARAM = "interactive";

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
  /** False when Stage 2 tables/seed (028–031) are missing — hide interactive tab. */
  interactiveAvailable?: boolean;
  /** Size of the interactive bank, shown beside the start button. */
  interactiveBankSize?: number;
  /** False on the student home, where «Сьогодні» already owns the page title. */
  showIntro?: boolean;
  /** Where theme and tab changes are written. The test lives on `/topic`. */
  basePath?: string;
};

/** “Тест за темою” — тема + кількість завдань з банку. */
export function TopicTestStart({
  themes,
  initialThemeId,
  displayName,
  interactiveAvailable = true,
  interactiveBankSize = 0,
  showIntro = true,
  basePath = "/topic",
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

  const wantsInteractive =
    searchParams.get("tab") === INTERACTIVE_TAB_PARAM;
  const activeTab =
    wantsInteractive && interactiveAvailable ? "interactive" : "topics";

  useEffect(() => {
    if (wantsInteractive && !interactiveAvailable) {
      const params = new URLSearchParams(searchParams.toString());
      params.delete("tab");
      const query = params.toString();
      router.replace(query ? `${basePath}?${query}` : basePath, { scroll: false });
    }
  }, [wantsInteractive, interactiveAvailable, router, searchParams, basePath]);

  function selectTab(tab: "topics" | "interactive") {
    if (tab === "interactive" && !interactiveAvailable) return;
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "interactive") params.set("tab", INTERACTIVE_TAB_PARAM);
    else params.delete("tab");
    const query = params.toString();
    router.replace(query ? `${basePath}?${query}` : basePath, { scroll: false });
  }

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

  const body = (
    <>
      <div className={css.tabs} role="tablist" aria-label={t("tabsAria")}>
        <button
          type="button"
          role="tab"
          id="topic-tab-topics"
          aria-selected={activeTab === "topics"}
          aria-controls="topic-panel-topics"
          className={clsx(css.tab, activeTab === "topics" && css.tabActive)}
          onClick={() => selectTab("topics")}
        >
          {t("tabTopics")}
        </button>
        {interactiveAvailable ? (
          <button
            type="button"
            role="tab"
            id="topic-tab-interactive"
            aria-selected={activeTab === "interactive"}
            aria-controls="topic-panel-interactive"
            className={clsx(
              css.tab,
              activeTab === "interactive" && css.tabActive,
            )}
            onClick={() => selectTab("interactive")}
          >
            {t("tabInteractive")}
          </button>
        ) : null}
      </div>

      {activeTab === "interactive" ? (
        <div
          role="tabpanel"
          id="topic-panel-interactive"
          aria-labelledby="topic-tab-interactive"
        >
          <InteractiveFormatsShowcase embedded bankSize={interactiveBankSize} />
        </div>
      ) : (
        <div
          className={css.panelStack}
          role="tabpanel"
          id="topic-panel-topics"
          aria-labelledby="topic-tab-topics"
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
                <Select
                  name="themeId"
                  value={String(selectedThemeId)}
                  disabled={controlsDisabled}
                  options={themes.map((theme, index) => ({
                    value: String(theme.id),
                    label: formatThemeLabel(index, theme),
                  }))}
                  onChange={(next) => {
                    const nextId = Number(next);
                    setOverrideThemeId(nextId);
                    const params = new URLSearchParams(searchParams.toString());
                    params.set("theme", String(nextId));
                    router.replace(`${basePath}?${params.toString()}`, {
                      scroll: false,
                    });
                  }}
                />
              </label>

              <div className={css.fieldCount}>
                <label className={css.label} htmlFor="topic-task-count">
                  {t("tasks")}
                </label>
                <div className={css.countWrap}>
                  <input
                    id="topic-task-count"
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
                    aria-describedby="topic-task-count-hint"
                    aria-label={t("taskCountAria", {
                      count: countValid ? parsedCount : 0,
                      total: bankSize,
                    })}
                    autoComplete="off"
                  />
                  <span className={css.countBank} aria-hidden>
                    <span className={css.countSlash}>/</span>
                    <span className={css.countTotal}>{bankSize}</span>
                  </span>
                </div>
                <span className={css.hint} id="topic-task-count-hint">
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

      <PagePanel className={css.fractionPromo}>
        <h2 className={css.formTitle}>{t("fractionPracticeTitle")}</h2>
        <p className={css.fractionPromoLead}>{t("fractionPracticeLead")}</p>
        <Link href="/practice/fractions" className={css.fractionPromoLink}>
          {t("fractionPracticeCta")} →
        </Link>
      </PagePanel>
        </div>
      )}
    </>
  );

  if (!showIntro) {
    return <div className={clsx(css.frame, css.follow)}>{body}</div>;
  }

  return (
    <PageFrame
      className={css.frame}
      title={
        <>
          {t("helloStart")} {displayName}
        </>
      }
      lead={t("lead")}
    >
      {body}
    </PageFrame>
  );
}
