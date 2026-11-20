"use client";

import { useId, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Select } from "@/components/ui/Select/Select";
import { MathText } from "@/components/ui/MathText";
import { addDayBankTasksAction, searchDayBankAction } from "@/modules/marathons/daily/actions";
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
  const [hits, setHits] = useState<Array<BankChoice & { difficulty?: number; otherDays?: number[] }>>([]);
  const [pending, setPending] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState("0");
  const [optionCount, setOptionCount] = useState<0 | 2 | 4>(0);
  const [checked, setChecked] = useState<number[]>([]);
  const dialogRef = useRef<HTMLDialogElement>(null);

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

  const onDay = useMemo(() => new Set(saved.map((item) => item.id)), [saved]);

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
        difficulty: Number(difficulty) || null,
        optionCount,
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

  const selected = hits.filter((hit) => checked.includes(hit.id) && !onDay.has(hit.id));
  const room = Math.max(0, DAY_BLOCK_MAX - saved.length);

  return (
    <div>
      {submissions > 0 ? <p className={css.meta}>{t("bankLocked")}</p> : (
        <button
          type="button"
          className={css.button}
          onClick={() => dialogRef.current?.showModal()}
        >
          {t("bankAddButton")}
        </button>
      )}
      <dialog ref={dialogRef} className={css.pickerDialog} aria-labelledby={titleId}>
        <h3 id={titleId}>{t("bankAddButton")}</h3>
        <p className={css.meta}>{t("bankSubjectMath")}</p>
        <div className={css.row2}>
          <div className={css.field}>
            <span className={css.fieldLabel} id={subjectLabel}>{t("bankSubject")}</span>
            <Select aria-labelledby={subjectLabel} options={subjectOptions} value={filterSubject} onChange={setFilterSubject} />
          </div>
          <div className={css.field}>
            <span className={css.fieldLabel} id={themeLabel}>{t("bankTheme")}</span>
            <Select aria-labelledby={themeLabel} options={themeOptions} value={themeId} onChange={setThemeId} placeholder={t("bankAllThemes")} />
          </div>
        </div>
        <div className={css.row2}>
          <div className={css.field}>
            <label className={css.fieldLabel} htmlFor={`${searchId}-difficulty`}>{t("bankDifficulty")}</label>
            <select
              id={`${searchId}-difficulty`}
              className={css.input}
              value={difficulty}
              onChange={(event) => setDifficulty(event.target.value)}
            >
              <option value="0">{t("bankDifficultyAll")}</option>
              {[1, 2, 3, 4, 5].map((level) => (
                <option key={level} value={level}>{level}</option>
              ))}
            </select>
          </div>
          <div className={css.field}>
            <label className={css.fieldLabel} htmlFor={`${searchId}-type`}>{t("bankType")}</label>
            <select
              id={`${searchId}-type`}
              className={css.input}
              value={String(optionCount)}
              onChange={(event) => setOptionCount(Number(event.target.value) as 0 | 2 | 4)}
            >
              <option value="0">{t("bankTypeAll")}</option>
              <option value="2">{t("bankTypeTwo")}</option>
              <option value="4">{t("bankTypeFour")}</option>
            </select>
          </div>
        </div>
        <div className={css.field}>
          <label className={css.fieldLabel} htmlFor={searchId}>{t("bankSearch")}</label>
          <input
            id={searchId}
            className={css.input}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoComplete="off"
          />
        </div>
        <div className={css.actions}>
          <button type="button" className={css.button} disabled={pending} onClick={() => void search()}>
            {pending ? t("working") : t("bankFind")}
          </button>
          <button type="button" className={css.buttonQuiet} onClick={() => dialogRef.current?.close()}>
            {t("bankClose")}
          </button>
        </div>
        {note ? <p className={css.fieldError} role="alert">{note}</p> : null}
        {hits.length > 0 ? (
          <ul className={css.taskList}>
            {hits.map((hit) => {
              const added = onDay.has(hit.id);
              const on = checked.includes(hit.id);
              return (
                <li key={hit.id} className={css.taskRow}>
                  <label className={css.meta}>
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={added}
                      onChange={() => {
                        setChecked((current) => (
                          current.includes(hit.id)
                            ? current.filter((id) => id !== hit.id)
                            : [...current, hit.id]
                        ));
                      }}
                    />
                    {" "}#{hit.id}
                    {hit.themeName ? ` · ${hit.themeName}` : ""}
                    {hit.difficulty ? ` · ${t("bankDifficulty")} ${hit.difficulty}` : ""}
                    {added ? ` · ${t("bankPicked")}` : ""}
                  </label>
                  {hit.otherDays && hit.otherDays.length > 0 ? (
                    <p className={css.fieldError}>{t("bankOtherDay", { days: hit.otherDays.join(", ") })}</p>
                  ) : null}
                  <MathText text={hit.prompt} as="div" />
                </li>
              );
            })}
          </ul>
        ) : null}
        <form action={addDayBankTasksAction}>
          <input type="hidden" name="marathonId" value={marathonId} />
          <input type="hidden" name="dayId" value={dayId} />
          {selected.slice(0, room).map((hit) => (
            <input key={hit.id} type="hidden" name="questionId" value={hit.id} />
          ))}
          <SubmitButton className={css.button} pendingLabel={t("saving")}>
            {t("bankAddSelected")}
          </SubmitButton>
        </form>
      </dialog>
    </div>
  );
}
