"use client";

import { useId, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Select } from "@/components/ui/Select/Select";
import { MathText } from "@/components/ui/MathText";
import { searchDayBankAction, saveDayTaskBlockAction } from "@/modules/marathons/daily/actions";
import { DAY_BLOCK_MAX } from "@/modules/marathons/daily/dayRemoval";
import { SubmitButton } from "../ConfirmSubmit";
import css from "../marathon.module.css";

export type BankThemeOption = {
  id: number;
  code: string;
  name: string;
  count: number;
};

export type BankChoice = {
  id: number;
  prompt: string;
  options: string[];
  themeName?: string;
};

export function DayTaskBank({
  marathonId,
  dayId,
  subject,
  themes,
  saved,
  submissions,
}: {
  marathonId: number;
  dayId: number;
  subject: string;
  themes: BankThemeOption[];
  saved: BankChoice[];
  submissions: number;
}) {
  const t = useTranslations("Marathon");
  const titleId = useId();
  const searchId = useId();
  const subjectLabel = useId();
  const themeLabel = useId();
  const [filterSubject, setFilterSubject] = useState(
    subject.trim().toLowerCase() === "math" ? "math" : subject.trim() || "math",
  );
  const [themeId, setThemeId] = useState("");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<BankChoice[]>([]);
  const [chosen, setChosen] = useState<BankChoice[]>(saved);
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const subjectOptions = useMemo(() => {
    const values = ["math"];
    const own = subject.trim().toLowerCase();
    if (own && own !== "math") values.unshift(own);
    return values.map((value) => ({ value, label: value }));
  }, [subject]);

  const themeOptions = useMemo(
    () => [
      { value: "", label: t("bankAllThemes") },
      ...themes.map((theme) => ({
        value: String(theme.id),
        label: t("bankThemeOption", { name: theme.name, count: theme.count }),
      })),
    ],
    [themes, t],
  );

  const chosenIds = useMemo(() => new Set(chosen.map((item) => item.id)), [chosen]);
  const savedIds = saved.map((item) => item.id);
  const sameSet =
    chosen.length === savedIds.length && chosen.every((item) => savedIds.includes(item.id));

  function add(task: BankChoice) {
    if (chosen.some((item) => item.id === task.id)) return;
    if (chosen.length >= DAY_BLOCK_MAX) {
      setNote(t("bankLimit", { max: DAY_BLOCK_MAX }));
      return;
    }
    setNote(null);
    setChosen((current) => [...current, task]);
  }

  function move(index: number, delta: number) {
    setChosen((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = current.slice();
      const [item] = next.splice(index, 1);
      if (!item) return current;
      next.splice(target, 0, item);
      return next;
    });
  }

  async function search() {
    setPending(true);
    setNote(null);
    try {
      const result = await searchDayBankAction({
        marathonId,
        dayId,
        subject: filterSubject,
        themeId: themeId ? Number(themeId) : null,
        query,
      });
      if (!result.ok) {
        setHits([]);
        if (result.error === "subject") setNote(t("bankSubjectEmpty"));
        else if (result.error === "narrow") setNote(t("bankNarrow"));
        else if (result.error === "empty") setNote(t("bankEmptySearch"));
        else setNote(t("errors.server"));
        return;
      }
      setHits(result.tasks);
    } catch {
      setNote(t("errors.server"));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className={css.bankPanel} aria-labelledby={titleId}>
      <h3 id={titleId}>{t("bankTitle")}</h3>
      <p className={css.meta}>{t("bankLead")}</p>
      <p className={css.meta}>{t("bankSubjectMath")}</p>
      {submissions > 0 ? <p className={css.meta}>{t("bankLocked")}</p> : null}
      <div className={css.row2}>
        <div className={css.field}>
          <span className={css.fieldLabel} id={subjectLabel}>
            {t("bankSubject")}
          </span>
          <Select
            aria-labelledby={subjectLabel}
            options={subjectOptions}
            value={filterSubject}
            onChange={setFilterSubject}
          />
        </div>
        <div className={css.field}>
          <span className={css.fieldLabel} id={themeLabel}>
            {t("bankTheme")}
          </span>
          <Select
            aria-labelledby={themeLabel}
            options={themeOptions}
            value={themeId}
            onChange={setThemeId}
            placeholder={t("bankAllThemes")}
          />
        </div>
      </div>
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
      <div className={css.actions}>
        <button
          type="button"
          className={css.button}
          disabled={pending}
          aria-busy={pending || undefined}
          onClick={() => void search()}
        >
          {pending ? t("working") : t("bankFind")}
        </button>
      </div>
      {note ? (
        <p className={css.fieldError} role="alert">
          {note}
        </p>
      ) : null}
      {hits.length > 0 ? (
        <ul className={css.taskList}>
          {hits.map((hit) => {
            const added = chosenIds.has(hit.id);
            return (
              <li key={hit.id} className={css.taskRow}>
                <p className={css.meta}>
                  #{hit.id}
                  {hit.themeName ? ` · ${hit.themeName}` : ""}
                </p>
                <MathText text={hit.prompt} as="div" />
                <div className={css.actions}>
                  <button
                    type="button"
                    className={css.buttonQuiet}
                    disabled={added}
                    onClick={() => add(hit)}
                  >
                    {added ? t("bankPicked") : t("bankPick")}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}
      <h4 className={css.dayTasksTitle}>{t("bankChosen")}</h4>
      {chosen.length === 0 ? <p className={css.meta}>{t("bankChosenEmpty")}</p> : null}
      {chosen.length > 0 ? (
        <ol className={css.taskList}>
          {chosen.map((task, index) => (
            <li key={task.id} className={css.taskRow}>
              <p className={css.meta}>
                {index + 1}. #{task.id}
                {task.themeName ? ` · ${task.themeName}` : ""}
              </p>
              <MathText text={task.prompt} as="div" />
              <div className={css.actions}>
                <button
                  type="button"
                  className={css.buttonQuiet}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  {t("bankUp")}
                </button>
                <button
                  type="button"
                  className={css.buttonQuiet}
                  disabled={index === chosen.length - 1}
                  onClick={() => move(index, 1)}
                >
                  {t("bankDown")}
                </button>
                <button
                  type="button"
                  className={css.buttonQuiet}
                  onClick={() => setChosen((current) => current.filter((item) => item.id !== task.id))}
                >
                  {t("bankRemove")}
                </button>
              </div>
            </li>
          ))}
        </ol>
      ) : null}
      <form
        action={saveDayTaskBlockAction}
        onSubmit={(event) => {
          if (submissions > 0 && !sameSet) {
            event.preventDefault();
            setNote(t("bankLocked"));
          }
        }}
      >
        <input type="hidden" name="marathonId" value={marathonId} />
        <input type="hidden" name="dayId" value={dayId} />
        {chosen.map((task) => (
          <input key={task.id} type="hidden" name="questionId" value={task.id} />
        ))}
        <SubmitButton className={css.button} pendingLabel={t("saving")}>
          {t("bankSave")}
        </SubmitButton>
      </form>
    </section>
  );
}
