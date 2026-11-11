"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import {
  generateSimilarTasksAction,
  publishQuizTaskAction,
  saveQuizTaskAction,
  type GenerateSimilarState,
  type PublishQuizTaskState,
  type SaveQuizTaskActionState,
} from "@/modules/admin-content/actions";
import type {
  AdminQuizTask,
  AdminThemeOption,
} from "@/modules/admin-content/types";
import { toAdminInput } from "@/modules/admin-content/mathField";
import { MIN_DIFFICULTY } from "@/modules/content-import/schema";
import { Select } from "@/components/ui/Select";
import css from "./AdminTaskForm.module.css";

const SAVE_INITIAL: SaveQuizTaskActionState = { status: "idle" };
const GENERATE_INITIAL: GenerateSimilarState = { status: "idle" };
const PUBLISH_INITIAL: PublishQuizTaskState = { status: "idle" };

type FormValues = {
  taskText: string;
  themeId: string;
  answer1: string;
  answer2: string;
  answer3: string;
  answer4: string;
  rightAnswerN: string;
  difficulty: string;
  comments: string;
  hintShort: string;
  paramValues: Record<number, string>;
};

function formatThemeLabel(index: number, theme: AdminThemeOption): string {
  return `${index + 1}. ${theme.name}`;
}

function valuesFromTask(task: AdminQuizTask): FormValues {
  const paramValues: Record<number, string> = {};
  for (const value of task.params) {
    paramValues[value.paramId] = String(value.intValue);
  }
  return {
    taskText: toAdminInput(task.taskText),
    themeId: String(task.themeId),
    answer1: toAdminInput(task.answer1),
    answer2: toAdminInput(task.answer2),
    answer3: toAdminInput(task.answer3),
    answer4: toAdminInput(task.answer4),
    rightAnswerN: String(task.rightAnswerN),
    difficulty: String(task.difficulty),
    comments: toAdminInput(task.comments),
    hintShort: task.hintShort,
    paramValues,
  };
}

function emptyValues(themeId: number): FormValues {
  return {
    taskText: "",
    themeId: String(themeId),
    answer1: "",
    answer2: "",
    answer3: "",
    answer4: "",
    rightAnswerN: "1",
    difficulty: "1",
    comments: "",
    hintShort: "",
    paramValues: {},
  };
}

export type AdminTaskFormProps = {
  mode: "create" | "edit";
  themes: AdminThemeOption[];
  themeId: number;
  task?: AdminQuizTask;
  nextTaskId?: number | null;
  backHref: string;
  llmEnabled?: boolean;
};

export function AdminTaskForm({
  mode,
  themes,
  themeId,
  task,
  nextTaskId = null,
  backHref,
  llmEnabled = false,
}: AdminTaskFormProps) {
  const t = useTranslations("AdminContent");
  const router = useRouter();
  const [form, setForm] = useState<FormValues>(() =>
    task ? valuesFromTask(task) : emptyValues(themeId),
  );

  const [saveState, saveAction, savePending] = useActionState(
    saveQuizTaskAction,
    SAVE_INITIAL,
  );
  const [generateState, generateAction, generatePending] = useActionState(
    generateSimilarTasksAction,
    GENERATE_INITIAL,
  );
  const [publishState, publishAction, publishPending] = useActionState(
    publishQuizTaskAction,
    PUBLISH_INITIAL,
  );

  useEffect(() => {
    if (saveState.status !== "success") return;

    if (saveState.mode === "create") {
      router.replace(`/tasks/${saveState.task.id}`);
      return;
    }

    router.refresh();
  }, [saveState, router]);

  useEffect(() => {
    if (generateState.status !== "success" && publishState.status !== "success") return;
    router.refresh();
  }, [generateState, publishState, router]);

  const listHref =
    form.themeId && Number(form.themeId) > 0
      ? `/?theme=${form.themeId}`
      : backHref;

  const themeParams =
    themes.find((theme) => String(theme.id) === form.themeId)?.params ?? [];

  function setParam(paramId: number, raw: string) {
    setForm((current) => ({
      ...current,
      paramValues: { ...current.paramValues, [paramId]: raw },
    }));
  }

  return (
    <div className={css.shell}>
      <div className={css.navRow}>
        <Link href={listHref} className={css.backLink}>
          ← {t("back")}
        </Link>
        {mode === "edit" && nextTaskId ? (
          <Link href={`/tasks/${nextTaskId}`} className={css.nextLink}>
            {t("nextTask")} →
          </Link>
        ) : null}
      </div>

      <section className={css.panel} aria-label={t("formAria")}>
        {mode === "edit" && task ? (
          <div className={css.draftBox}>
            <p className={css.badgeRow}>
              <span className={task.status === "draft" ? css.badgeDraft : css.badgeLive}>
                {task.status === "draft" ? t("badgeDraft") : t("badgePublished")}
              </span>
              {task.sourceTaskId ? (
                <Link href={`/tasks/${task.sourceTaskId}`} className={css.sourceLink}>
                  {t("sourceTask", { id: task.sourceTaskId })}
                </Link>
              ) : null}
            </p>
            {task.status === "draft" ? <p className={css.hint}>{t("draftNote")}</p> : null}
            {task.status === "draft" ? (
              <form action={publishAction} className={css.generateForm}>
                <input type="hidden" name="taskId" value={task.id} />
                <button type="submit" className={css.publishBtn} disabled={publishPending || savePending}>
                  {publishPending ? t("publishing") : t("publish")}
                </button>
              </form>
            ) : null}
            {llmEnabled ? (
              <form action={generateAction} className={css.generateForm}>
                <input type="hidden" name="taskId" value={task.id} />
                <label className={css.generateCount}>
                  <span className={css.label}>{t("generateCount")}</span>
                  <input
                    className={css.countInput}
                    type="number"
                    name="count"
                    min={1}
                    max={5}
                    defaultValue={3}
                    inputMode="numeric"
                    aria-label={t("generateCount")}
                    disabled={generatePending || savePending}
                  />
                </label>
                <button
                  type="submit"
                  className={css.generateBtn}
                  disabled={generatePending || savePending}
                >
                  {generatePending ? t("generating") : t("generateSimilar")}
                </button>
              </form>
            ) : null}
            {publishState.status === "success" ? (
              <p className={clsx(css.alert, css.alertSuccess)} role="status">
                {t("published")}
              </p>
            ) : null}
            {generateState.status === "success" ? (
              <p className={clsx(css.alert, css.alertSuccess)} role="status">
                {generateState.saved === 0
                  ? t("generatedNone")
                  : t("generated", {
                      saved: generateState.saved,
                      discarded: generateState.discarded,
                    })}
              </p>
            ) : null}
            {generateState.status === "error" ? (
              <p className={clsx(css.alert, css.alertError)} role="alert">
                {t(`errors.${generateState.code}`)}
              </p>
            ) : null}
            {publishState.status === "error" ? (
              <p className={clsx(css.alert, css.alertError)} role="alert">
                {t(`errors.${publishState.code}`)}
              </p>
            ) : null}
          </div>
        ) : null}
        <form action={saveAction} className={css.form}>
          {mode === "edit" && task ? (
            <input type="hidden" name="taskId" value={task.id} />
          ) : null}

          <label className={css.field}>
            <span className={css.label}>{t("taskText")}</span>
            <textarea
              className={css.taskArea}
              name="taskText"
              value={form.taskText}
              onChange={(e) => setForm({ ...form, taskText: e.target.value })}
              required
              rows={6}
              disabled={savePending}
            />
          </label>

          <div className={css.answers}>
            {([1, 2, 3, 4] as const).map((n) => {
              const key = `answer${n}` as const;
              return (
                <label key={key} className={css.field}>
                  <span className={css.label}>{t("answer", { n })}</span>
                  <input
                    className={css.input}
                    name={key}
                    value={form[key]}
                    onChange={(e) =>
                      setForm({ ...form, [key]: e.target.value })
                    }
                    required
                    maxLength={255}
                    disabled={savePending}
                  />
                </label>
              );
            })}
          </div>

          <div className={css.meta}>
            <label className={css.field}>
              <span className={css.label}>{t("rightAnswer")}</span>
              <Select
                name="rightAnswerN"
                value={form.rightAnswerN}
                disabled={savePending}
                options={[1, 2, 3, 4].map((n) => ({
                  value: String(n),
                  label: t("answer", { n }),
                }))}
                onChange={(next) => setForm({ ...form, rightAnswerN: next })}
              />
            </label>

            <label className={css.field}>
              <span className={css.label}>{t("difficulty")}</span>
              <input
                className={clsx(css.input, css.diffInput)}
                name="difficulty"
                type="number"
                min={MIN_DIFFICULTY}
                step={1}
                value={form.difficulty}
                onChange={(e) =>
                  setForm({ ...form, difficulty: e.target.value })
                }
                required
                disabled={savePending}
              />
            </label>

            <label className={css.field}>
              <span className={css.label}>{t("theme")}</span>
              <Select
                name="themeId"
                value={form.themeId}
                required
                disabled={savePending}
                options={themes.map((theme, index) => ({
                  value: String(theme.id),
                  label: formatThemeLabel(index, theme),
                }))}
                onChange={(next) => setForm({ ...form, themeId: next })}
              />
            </label>
          </div>

          <div className={css.params}>
            <h2 className={css.paramsTitle}>{t("paramsTitle")}</h2>
            <p className={css.paramsLead}>{t("paramsFormLead")}</p>
            {themeParams.length === 0 ? (
              <p className={css.paramsEmpty}>{t("paramsFormEmpty")}</p>
            ) : (
              <div className={css.paramList}>
                {themeParams.map((param) =>
                  param.valueType === "bool" ? (
                    <div key={param.id}>
                      <label className={css.paramCheck}>
                        <input
                          type="checkbox"
                          checked={form.paramValues[param.id] === "1"}
                          disabled={savePending}
                          aria-label={t("paramBoolAria", { name: param.name })}
                          onChange={(event) =>
                            setParam(param.id, event.target.checked ? "1" : "0")
                          }
                        />
                        <span>{param.name}</span>
                      </label>
                      <input
                        type="hidden"
                        name={`param.${param.id}`}
                        value={form.paramValues[param.id] === "1" ? "1" : "0"}
                      />
                    </div>
                  ) : (
                    <label key={param.id} className={css.field}>
                      <span className={css.paramIntLabel}>{param.name}</span>
                      <input
                        className={clsx(css.input, css.paramNumber)}
                        type="text"
                        inputMode="numeric"
                        name={`param.${param.id}`}
                        value={form.paramValues[param.id] ?? ""}
                        aria-label={t("paramIntAria", { name: param.name })}
                        disabled={savePending}
                        onChange={(event) => {
                          const next = event.target.value.replace(/[^\d]/g, "");
                          setParam(param.id, next.slice(0, 10));
                        }}
                      />
                    </label>
                  ),
                )}
              </div>
            )}
          </div>

          <label className={css.field}>
            <span className={css.label}>{t("hintShort")}</span>
            <textarea
              className={css.hintArea}
              name="hintShort"
              value={form.hintShort}
              onChange={(e) => setForm({ ...form, hintShort: e.target.value })}
              rows={2}
              maxLength={280}
              disabled={savePending}
            />
            <span className={css.hint}>{t("hintShortHint")}</span>
          </label>

          <label className={css.field}>
            <span className={css.label}>{t("comments")}</span>
            <textarea
              className={css.hintArea}
              name="comments"
              value={form.comments}
              onChange={(e) => setForm({ ...form, comments: e.target.value })}
              rows={3}
              disabled={savePending}
            />
          </label>

          <div className={css.formActions}>
            <button
              type="submit"
              className={css.saveBtn}
              disabled={savePending}
            >
              {savePending ? t("saving") : t("save")}
            </button>
            <Link href={listHref} className={css.cancelBtn}>
              {t("back")}
            </Link>
            {mode === "edit" && nextTaskId ? (
              <Link href={`/tasks/${nextTaskId}`} className={css.nextBtn}>
                {t("nextTask")}
              </Link>
            ) : null}
          </div>
        </form>

        {saveState.status === "success" ? (
          <p className={clsx(css.alert, css.alertSuccess)} role="status">
            {saveState.mode === "create" ? t("created") : t("updated")}
          </p>
        ) : null}
        {saveState.status === "error" ? (
          <p className={clsx(css.alert, css.alertError)} role="alert">
            {t(`errors.${saveState.code}`)}
          </p>
        ) : null}
      </section>
    </div>
  );
}
