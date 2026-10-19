"use client";

import { useId, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Select } from "@/components/ui/Select/Select";
import { MathText } from "@/components/ui/MathText";
import {
  addSampledTasksAction,
  previewTopicSampleAction,
} from "@/modules/marathons/daily/actions";

type BankPreview = {
  id: number;
  prompt: string;
  options: string[];
};
import { SubmitButton } from "../ConfirmSubmit";
import css from "../marathon.module.css";

export type BankThemeOption = {
  id: number;
  code: string;
  name: string;
  count: number;
};

export function DayTaskBank({
  marathonId,
  dayId,
  themes,
  savedQuestionIds,
  initialPreview = [],
}: {
  marathonId: number;
  dayId: number;
  themes: BankThemeOption[];
  savedQuestionIds: number[];
  /** Already chosen questions, before they are saved on the day. */
  initialPreview?: BankPreview[];
}) {
  const t = useTranslations("Marathon");
  const titleId = useId();
  const searchId = useId();
  const countId = useId();
  const themeLabel = useId();
  const [query, setQuery] = useState("");
  const [themeId, setThemeId] = useState("");
  const [count, setCount] = useState(5);
  const [preview, setPreview] = useState<BankPreview[]>(initialPreview);
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const needle = query.trim().toLowerCase();
  const matchedThemes = useMemo(() => {
    if (!needle) return themes;
    return themes.filter(
      (theme) =>
        theme.name.toLowerCase().includes(needle) ||
        theme.code.toLowerCase().includes(needle) ||
        String(theme.id).includes(needle),
    );
  }, [needle, themes]);

  const options = useMemo(() => {
    const matched = matchedThemes;
    const selected = themes.find((theme) => String(theme.id) === themeId);
    const visible =
      selected && !matched.some((theme) => theme.id === selected.id)
        ? [selected, ...matched]
        : matched;
    return visible.map((theme) => ({
      value: String(theme.id),
      label: t("bankThemeOption", { name: theme.name, count: theme.count }),
    }));
  }, [matchedThemes, themeId, themes, t]);

  async function loadSample(excludeIds: number[]): Promise<BankPreview[] | null> {
    const theme = Number(themeId);
    if (!Number.isInteger(theme) || theme <= 0) return null;
    setPending(true);
    setNote(null);
    try {
      const result = await previewTopicSampleAction({
        marathonId,
        dayId,
        themeId: theme,
        count,
        excludeIds,
      });
      if (!result.ok) {
        setNote(result.error === "empty" ? t("bankEmptyDraw") : t("errors.invalid"));
        return result.error === "empty" ? [] : null;
      }
      if (result.questions.length === 0) {
        setNote(t("bankEmptyDraw"));
        return [];
      }
      return result.questions;
    } catch {
      setNote(t("errors.server"));
      return null;
    } finally {
      setPending(false);
    }
  }

  async function draw() {
    const questions = await loadSample(savedQuestionIds);
    if (questions) setPreview(questions);
  }

  function remove(id: number) {
    setPreview((current) => current.filter((item) => item.id !== id));
  }

  async function replaceOne(id: number) {
    const questions = await loadSample([
      ...savedQuestionIds,
      ...preview.map((item) => item.id),
    ]);
    const next = questions?.[0];
    if (!next) return;
    setPreview((current) => current.map((item) => (item.id === id ? next : item)));
  }

  if (themes.length === 0) {
    return (
      <section className={css.bankPanel} aria-labelledby={titleId}>
        <h3 id={titleId}>{t("bankTitle")}</h3>
        <p className={css.meta}>{t("bankSubjectEmpty")}</p>
      </section>
    );
  }

  return (
    <section className={css.bankPanel} aria-labelledby={titleId}>
      <h3 id={titleId}>{t("bankTitle")}</h3>
      <p className={css.meta}>{t("bankLead")}</p>
      <div className={css.field}>
        <label className={css.fieldLabel} htmlFor={searchId}>
          {t("bankSearch")}
        </label>
        <input
          id={searchId}
          className={css.input}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("bankSearch")}
          autoComplete="off"
        />
      </div>
      <div className={css.row2}>
        <div className={css.field}>
          <span className={css.fieldLabel} id={themeLabel}>
            {t("bankTheme")}
          </span>
          <Select
            aria-labelledby={themeLabel}
            options={options}
            value={themeId}
            onChange={setThemeId}
            placeholder={t("bankThemePlaceholder")}
          />
        </div>
        <div className={css.field}>
          <label className={css.fieldLabel} htmlFor={countId}>
            {t("bankCount")}
          </label>
          <input
            id={countId}
            className={css.input}
            type="number"
            min={1}
            max={20}
            value={count}
            onChange={(event) => setCount(Number(event.target.value))}
          />
        </div>
      </div>
      {needle && matchedThemes.length === 0 ? (
        <p className={css.meta}>{t("bankNoTheme")}</p>
      ) : null}
      <div className={css.actions}>
        <button
          type="button"
          className={css.button}
          disabled={!themeId || pending}
          aria-busy={pending || undefined}
          onClick={() => void draw()}
        >
          {pending ? t("working") : t("bankDraw")}
        </button>
        {preview.length > 0 ? (
          <button
            type="button"
            className={css.buttonQuiet}
            disabled={pending}
            onClick={() => void draw()}
          >
            {t("bankReshuffle")}
          </button>
        ) : null}
      </div>
      {note ? (
        <p className={css.fieldError} role="alert">
          {note}
        </p>
      ) : null}
      {preview.length > 0 ? (
        <>
          <p className={css.meta}>{t("bankPreview")}</p>
          <ul className={css.taskList}>
            {preview.map((question) => (
              <li key={question.id} className={css.taskRow}>
                <p className={css.meta}>#{question.id}</p>
                <MathText text={question.prompt} as="div" />
                {question.options.length > 0 ? (
                  <ol className={css.taskOptions}>
                    {question.options.map((option, index) => (
                      <li key={`${question.id}-${index}`}>
                        <MathText text={option} as="span" />
                      </li>
                    ))}
                  </ol>
                ) : null}
                <div className={css.actions}>
                  <button
                    type="button"
                    className={css.buttonQuiet}
                    disabled={pending}
                    onClick={() => remove(question.id)}
                  >
                    {t("bankRemove")}
                  </button>
                  <button
                    type="button"
                    className={css.buttonQuiet}
                    disabled={pending}
                    onClick={() => void replaceOne(question.id)}
                  >
                    {t("bankReplace")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <form action={addSampledTasksAction}>
            <input type="hidden" name="marathonId" value={marathonId} />
            <input type="hidden" name="dayId" value={dayId} />
            <input type="hidden" name="themeId" value={themeId} />
            {preview.map((question) => (
              <input key={question.id} type="hidden" name="questionId" value={question.id} />
            ))}
            <SubmitButton className={css.button} pendingLabel={t("saving")}>
              {t("bankAdd")}
            </SubmitButton>
          </form>
        </>
      ) : null}
    </section>
  );
}
