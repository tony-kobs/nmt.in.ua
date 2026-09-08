"use client";

import { useTranslations } from "next-intl";
import { useActionState, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import clsx from "clsx";
import { PageFrame, PagePanel } from "@/components/dashboard/PageFrame";
import { ModeTabs } from "@/components/ui/ModeTabs";
import { SelfScorePicker } from "@/components/ui/SelfScorePicker";
import { CheckIcon, TimerIcon } from "@/components/welcome/icons";
import {
  startTopicTestAction,
  type StartTopicTestActionState,
} from "@/modules/testing/actions";
import {
  parseThemeQueryParam,
  resolveInitialThemeId,
} from "@/modules/testing/parseThemeQueryParam";
import {
  previewTaskCount,
  TOPIC_TEST_TASK_COUNT,
  ULTIMATE_TASK_LIMIT,
  type TopicTestMode,
} from "@/modules/testing/topicTestMode";
import type { AvailableTopicTheme } from "@/modules/testing/types";
import css from "./TopicTestStart.module.css";

const INITIAL_STATE: StartTopicTestActionState = { status: "idle" };

function formatThemeLabel(index: number, theme: AvailableTopicTheme): string {
  return `${index + 1}. ${theme.name}`;
}

type TopicTestStartProps = {
  themes: AvailableTopicTheme[];
  initialThemeId?: number;
  displayName: string;
};

/** “Тест за обраною темою” — standard or Ultimate mode. */
export function TopicTestStart({
  themes,
  initialThemeId,
  displayName,
}: TopicTestStartProps) {
  const t = useTranslations("TopicTestStart");
  const modeOptions = [
    { id: "standard" as const, label: t("modes.standard") },
    {
      id: "ultimate" as const,
      label: t("modes.ultimate"),
      tone: "ultimate" as const,
    },
  ];

  const router = useRouter();
  const searchParams = useSearchParams();
  const [state, formAction, pending] = useActionState(
    startTopicTestAction,
    INITIAL_STATE,
  );
  const [mode, setMode] = useState<TopicTestMode>("standard");

  useEffect(() => {
    if (state.status === "success") {
      const query = state.mode === "ultimate" ? "?mode=ultimate" : "";
      router.replace(`/session/${state.sessionId}${query}`);
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
  const tasksToRun = previewTaskCount(mode, bankSize);
  const controlsDisabled = pending || isRedirecting;

  const [selfScore, setSelfScore] = useState<number | null>(null);
  // A fresh self-assessment is required before every topic test — never
  // carry the previous theme's answer over to a different theme. Reset
  // during render (React's recommended way to reset state on a prop
  // change) rather than in an effect, which would cascade an extra render.
  const [selfScoreThemeId, setSelfScoreThemeId] = useState(selectedThemeId);
  if (selfScoreThemeId !== selectedThemeId) {
    setSelfScoreThemeId(selectedThemeId);
    setSelfScore(null);
  }

  return (
    <PageFrame
      kicker={t("kicker")}
      title={
        <>
          {t("helloStart")} <span className={css.accent}>{displayName}</span>
        </>
      }
      lead={t("lead")}
    >
      <div className={css.layout}>
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

                <div className={css.optionsRow}>
                  <div className={clsx(css.field, css.fieldMode)}>
                    <span className={css.label}>{t("mode")}</span>
                    <ModeTabs
                      value={mode}
                      onChange={setMode}
                      options={modeOptions}
                      disabled={controlsDisabled}
                      ariaLabel={t("testMode")}
                      stretch
                      className={css.modeTabs}
                    />
                    <input type="hidden" name="mode" value={mode} />
                  </div>

                  <div className={clsx(css.field, css.fieldCount)}>
                    <span className={css.label}>{t("tasks")}</span>
                    <div
                      className={css.countBadge}
                      aria-label={t("taskCount", {
                        count: tasksToRun,
                        total: bankSize,
                      })}
                    >
                      <span className={css.countFraction}>
                        <span className={css.countNum}>{tasksToRun}</span>
                        <span className={css.countSlash} aria-hidden>
                          /
                        </span>
                        <span className={css.countTotal}>{bankSize}</span>
                      </span>
                    </div>
                  </div>
                </div>

                <div className={css.field}>
                  <span className={css.label}>{t("selfScoreLabel")}</span>
                  <SelfScorePicker
                    value={selfScore}
                    onChange={setSelfScore}
                    ariaLabel={t("selfScoreAria")}
                    disabled={controlsDisabled}
                  />
                  <span className={css.hint}>{t("selfScoreHint")}</span>
                  <input type="hidden" name="selfScore" value={selfScore ?? ""} />
                </div>
              </div>

              <button
                type="submit"
                className={clsx(
                  css.start,
                  mode === "ultimate" && css.startUltimate,
                )}
                disabled={controlsDisabled || tasksToRun === 0 || selfScore === null}
              >
                {isRedirecting
                  ? t("redirecting")
                  : pending
                    ? t("loading")
                    : mode === "ultimate"
                      ? t("startUltimate")
                      : t("start")}
              </button>
            </form>
          </PagePanel>
        )}

        <ul className={css.modeCards}>
          <li className={css.modeCard}>
            <span className={css.modeIcon} aria-hidden>
              <CheckIcon size={18} />
            </span>
            <h3 className={css.modeCardTitle}>{t("modes.standard")}</h3>
            <p className={css.modeCardText}>
              {t("leadStandard", { count: TOPIC_TEST_TASK_COUNT })}
            </p>
          </li>
          <li className={clsx(css.modeCard, css.modeCardUltimate)}>
            <span className={css.modeIcon} aria-hidden>
              <TimerIcon size={18} />
            </span>
            <h3 className={css.modeCardTitle}>{t("modes.ultimate")}</h3>
            <p className={css.modeCardText}>
              {t("leadUltimate", { count: ULTIMATE_TASK_LIMIT })}
            </p>
          </li>
        </ul>
      </div>

      {state.status === "error" ? (
        <p className={css.error} role="alert">
          {t(`errors.${state.code}`)}
        </p>
      ) : null}
    </PageFrame>
  );
}
