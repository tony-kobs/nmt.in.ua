"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Select } from "@/components/ui/Select/Select";
import { createDayTaskAction } from "@/modules/marathons/daily/actions";
import { SubmitButton } from "../ConfirmSubmit";
import css from "../marathon.module.css";
import type { BankThemeOption } from "./DayTaskBank";

export function CreateDayTask({
  marathonId,
  dayId,
  themes,
}: {
  marathonId: number;
  dayId: number;
  themes: BankThemeOption[];
}) {
  const t = useTranslations("Marathon");
  const formId = useId();
  const themeLabel = useId();
  const difficultyLabel = useId();
  const [open, setOpen] = useState(false);
  const [saveToBank, setSaveToBank] = useState(false);
  const [themeId, setThemeId] = useState(themes[0] ? String(themes[0].id) : "");
  const [difficulty, setDifficulty] = useState("1");

  return (
    <>
      <button type="button" className={css.button} onClick={() => setOpen(true)} aria-expanded={open}>
        {t("createTask")}
      </button>
      {open ? (
        <form action={createDayTaskAction} className={`${css.stack} ${css.createTaskForm}`}>
          <p className={css.meta}>{t("createTaskLead")}</p>
          <input type="hidden" name="marathonId" value={marathonId} />
          <input type="hidden" name="dayId" value={dayId} />
          <label className={css.field}>
            <span className={css.fieldLabel}>{t("fields.prompt")}</span>
            <textarea id={`${formId}-prompt`} className={css.input} name="prompt" rows={3} required />
          </label>
          {[1, 2, 3, 4].map((index) => (
            <label key={index} className={css.field}>
              <span className={css.fieldLabel}>
                {t("fields.options")} {index}
              </span>
              <input id={`${formId}-option-${index}`} className={css.input} name={`option${index}`} required={index <= 2} />
            </label>
          ))}
          <label className={css.field}>
            <span className={css.fieldLabel}>{t("fields.correct")}</span>
            <input id={`${formId}-correct`} className={css.input} name="correct" type="number" min={1} max={4} defaultValue={1} required />
          </label>
          <label className={css.field}>
            <span className={css.fieldLabel}>{t("fields.explanation")}</span>
            <textarea id={`${formId}-explanation`} className={css.input} name="explanation" rows={2} />
          </label>
          <label className={css.pickerCheck}>
            <input
              type="checkbox"
              name="saveToBank"
              value="1"
              checked={saveToBank}
              onChange={(event) => setSaveToBank(event.target.checked)}
            />
            <span>{t("saveToBank")}</span>
          </label>
          {saveToBank ? (
            <>
              <p className={css.meta}>{t("bankFieldsNote")}</p>
              <div className={css.field}>
                <span className={css.fieldLabel} id={themeLabel}>{t("bankTheme")}</span>
                <Select
                  aria-labelledby={themeLabel}
                  name="themeId"
                  options={themes.map((theme) => ({
                    value: String(theme.id),
                    label: theme.name,
                  }))}
                  value={themeId}
                  onChange={setThemeId}
                />
              </div>
              <div className={css.field}>
                <span className={css.fieldLabel} id={difficultyLabel}>{t("bankDifficulty")}</span>
                <Select
                  aria-labelledby={difficultyLabel}
                  name="difficulty"
                  options={[1, 2, 3, 4, 5].map((level) => ({ value: String(level), label: String(level) }))}
                  value={difficulty}
                  onChange={setDifficulty}
                />
              </div>
            </>
          ) : null}
          <div className={css.actions}>
            <SubmitButton className={css.button} pendingLabel={t("saving")}>
              {t("save")}
            </SubmitButton>
            <button type="button" className={css.buttonQuiet} onClick={() => setOpen(false)}>
              {t("bankClose")}
            </button>
          </div>
        </form>
      ) : null}
    </>
  );
}
