"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { askConfirm } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { Select } from "@/components/ui/Select";
import { bankExcerpt } from "@/modules/textbook/bankTask";
import {
  deleteTeacherSessionAction,
  fillSessionBankAction,
  saveTeacherSessionAction,
  searchSessionBankAction,
  type TeacherSessionActionState,
} from "@/modules/teacher-sessions/actions";
import {
  MAX_SESSION_TASKS,
  type SessionTaskView,
  type TeacherSessionDetail,
} from "@/modules/teacher-sessions/types";
import type { AvailableTopicTheme } from "@/modules/testing/types";
import { SessionTaskCard } from "./SessionTaskCard";
import css from "./TeacherSessionEditor.module.css";

const IDLE: TeacherSessionActionState = { status: "idle" };

type TeacherSessionEditorProps = {
  themes: AvailableTopicTheme[];
  session: TeacherSessionDetail | null;
};

export function TeacherSessionEditor({ themes, session }: TeacherSessionEditorProps) {
  const t = useTranslations("TeacherSessions");
  const locked = (session?.assignmentCount ?? 0) > 0;
  const [title, setTitle] = useState(session?.title ?? "");
  const [themeId, setThemeId] = useState(
    String(session?.themeId ?? themes[0]?.id ?? ""),
  );
  const [difficulty, setDifficulty] = useState(String(session?.difficulty ?? 1));
  const [tasks, setTasks] = useState<SessionTaskView[]>(session?.tasks ?? []);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SessionTaskView[]>([]);
  const [fillCount, setFillCount] = useState("10");
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<"search" | "fill" | null>(null);

  const [saveState, saveAction, savePending] = useActionState(
    saveTeacherSessionAction,
    IDLE,
  );
  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteTeacherSessionAction,
    IDLE,
  );

  const theme = themes.find((item) => String(item.id) === themeId);

  function addTask(task: SessionTaskView) {
    if (tasks.some((item) => item.id === task.id)) return;
    if (tasks.length >= MAX_SESSION_TASKS) {
      setNote(t("errors.too_many", { max: MAX_SESSION_TASKS }));
      return;
    }
    setNote(null);
    setTasks((current) => [...current, { ...task, position: current.length + 1 }]);
  }

  async function onSearch() {
    const themeNumber = Number(themeId);
    if (!Number.isInteger(themeNumber) || themeNumber <= 0) return;
    setBusy("search");
    setNote(null);
    const level = Number(difficulty);
    const result = await searchSessionBankAction({
      themeId: themeNumber,
      query,
      difficulty: Number.isInteger(level) && level > 0 ? level : null,
    });
    setBusy(null);
    if (result.status === "error") {
      setNote(t("errors.generic"));
      return;
    }
    setHits(result.tasks);
    if (result.tasks.length === 0) setNote(t("searchEmpty"));
  }

  async function onFill() {
    const themeNumber = Number(themeId);
    const level = Number(difficulty);
    const count = Number(fillCount);
    if (!Number.isInteger(themeNumber) || themeNumber <= 0) return;
    if (!Number.isInteger(level) || level <= 0) return;
    setBusy("fill");
    setNote(null);
    const result = await fillSessionBankAction({
      themeId: themeNumber,
      difficulty: level,
      count: Number.isInteger(count) ? count : 10,
      excludeIds: tasks.map((task) => task.id),
    });
    setBusy(null);
    if (result.status === "error") {
      setNote(t("errors.generic"));
      return;
    }
    if (result.tasks.length === 0) {
      setNote(t("fillEmpty"));
      return;
    }
    setTasks((current) => {
      const seen = new Set(current.map((task) => task.id));
      const next = [...current];
      for (const task of result.tasks) {
        if (seen.has(task.id) || next.length >= MAX_SESSION_TASKS) continue;
        seen.add(task.id);
        next.push(task);
      }
      return next;
    });
  }

  function move(index: number, delta: number) {
    setTasks((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = current.slice();
      const [item] = next.splice(index, 1);
      if (!item) return current;
      next.splice(target, 0, item);
      return next;
    });
  }

  if (themes.length === 0) {
    return <p className={css.empty}>{t("noThemes")}</p>;
  }

  return (
    <div className={css.page}>
      <p className={css.backRow}>
        <Link className={css.back} href="/assign">
          {t("back")}
        </Link>
      </p>

      {locked ? (
        <p className={css.warn} role="status">
          {t("assignedWarn", { count: session?.assignmentCount ?? 0 })}
        </p>
      ) : null}

      <form
        action={saveAction}
        className={css.form}
        onSubmit={(event) => {
          if (!locked) return;
          const submitter = event.nativeEvent instanceof SubmitEvent
            ? event.nativeEvent.submitter
            : null;
          if (!(submitter instanceof HTMLButtonElement)) return;
          if (submitter.dataset.confirmed === "1") {
            delete submitter.dataset.confirmed;
            return;
          }
          event.preventDefault();
          const form = event.currentTarget;
          void askConfirm(t("assignedConfirm")).then((ok) => {
            if (!ok) return;
            submitter.dataset.confirmed = "1";
            form.requestSubmit(submitter);
          });
        }}
      >
        {session ? <input type="hidden" name="sessionId" value={session.id} /> : null}
        {tasks.map((task) =>
          task.id > 0 ? (
            <input key={task.id} type="hidden" name="taskIds" value={task.id} />
          ) : null,
        )}

        <label className={css.field}>
          <span className={css.label}>{t("titleLabel")}</span>
          <input
            className={css.input}
            name="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            maxLength={160}
            disabled={savePending}
          />
        </label>

        <div className={css.split}>
          <label className={css.field}>
            <span className={css.label}>{t("topic")}</span>
            {locked ? (
              <>
                <input type="hidden" name="themeId" value={themeId} />
                <p className={css.locked}>{theme?.name ?? session?.themeName}</p>
                <p className={css.hint}>{t("themeLocked")}</p>
              </>
            ) : (
              <Select
                name="themeId"
                value={themeId}
                onChange={(value) => {
                  if (value !== themeId) setTasks([]);
                  setThemeId(value);
                  setHits([]);
                }}
                disabled={savePending}
                options={themes.map((item) => ({
                  value: String(item.id),
                  label: item.name,
                }))}
              />
            )}
          </label>

          <label className={css.field}>
            <span className={css.label}>{t("difficulty")}</span>
            <input
              className={css.input}
              type="number"
              name="difficulty"
              min={1}
              max={255}
              step={1}
              value={difficulty}
              onChange={(event) => setDifficulty(event.target.value)}
              required
              disabled={savePending}
            />
          </label>
        </div>

        <section className={css.bank} aria-labelledby="session-bank-title">
          <h2 id="session-bank-title" className={css.sectionTitle}>
            {t("bankTitle")}
          </h2>
          <p className={css.lead}>{t("bankLead")}</p>
          <div className={css.bankRow}>
            <label className={css.field}>
              <span className={css.label}>{t("searchLabel")}</span>
              <input
                className={css.input}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("searchPlaceholder")}
                disabled={busy !== null}
              />
            </label>
            <button
              type="button"
              className={css.secondary}
              onClick={() => void onSearch()}
              disabled={busy !== null}
            >
              {busy === "search" ? t("searching") : t("search")}
            </button>
          </div>
          <div className={css.bankRow}>
            <label className={css.field}>
              <span className={css.label}>{t("fillCount")}</span>
              <input
                className={css.input}
                type="number"
                min={1}
                max={MAX_SESSION_TASKS}
                step={1}
                value={fillCount}
                onChange={(event) => setFillCount(event.target.value)}
                disabled={busy !== null}
              />
            </label>
            <button
              type="button"
              className={css.secondary}
              onClick={() => void onFill()}
              disabled={busy !== null}
            >
              {busy === "fill" ? t("filling") : t("fill")}
            </button>
          </div>

          {hits.length > 0 ? (
            <ul className={css.hits}>
              {hits.map((hit) => {
                const added = tasks.some((task) => task.id === hit.id);
                return (
                  <li key={hit.id} className={css.hit}>
                    <p className={css.hitText}>
                      {bankExcerpt(hit.prompt || hit.name) || t("taskLabel", { n: hit.id })}
                    </p>
                    <button
                      type="button"
                      className={css.tool}
                      disabled={added}
                      onClick={() => addTask(hit)}
                    >
                      {added ? t("added") : t("add")}
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </section>

        <section className={css.listSection} aria-labelledby="session-tasks-title">
          <h2 id="session-tasks-title" className={css.sectionTitle}>
            {t("tasksHeading")}
          </h2>
          <p className={css.lead}>{t("tasksLead")}</p>
          {tasks.length === 0 ? <p className={css.empty}>{t("tasksEmpty")}</p> : null}
          <ol className={css.taskList}>
            {tasks.map((task, index) => (
              <li key={`${task.id}-${index}`}>
                <SessionTaskCard
                  task={task}
                  index={index}
                  disableUp={index === 0 || savePending}
                  disableDown={index === tasks.length - 1 || savePending}
                  onUp={() => move(index, -1)}
                  onDown={() => move(index, 1)}
                  onRemove={() =>
                    setTasks((current) => current.filter((_, item) => item !== index))
                  }
                />
              </li>
            ))}
          </ol>
        </section>

        {note ? (
          <p className={css.note} role="status">
            {note}
          </p>
        ) : null}
        {saveState.status === "success" ? (
          <p className={clsx(css.note, css.ok)} role="status">
            {t("saved")}
          </p>
        ) : null}
        {saveState.status === "error" ? (
          <p className={clsx(css.note, css.bad)} role="alert">
            {t(`errors.${saveState.code}`, { max: MAX_SESSION_TASKS })}
          </p>
        ) : null}

        <button type="submit" className={css.submit} disabled={savePending}>
          {savePending ? t("saving") : t("save")}
        </button>
      </form>

      {session && session.referenceCount === 0 ? (
        <form action={deleteAction} className={css.deleteForm}>
          <input type="hidden" name="sessionId" value={session.id} />
          <button
            type="submit"
            className={css.danger}
            disabled={deletePending}
            onClick={(event) => {
              const button = event.currentTarget;
              const form = button.form;
              if (button.dataset.confirmed === "1") {
                delete button.dataset.confirmed;
                return;
              }
              event.preventDefault();
              void askConfirm(t("deleteConfirm")).then((ok) => {
                if (!ok || !form) return;
                button.dataset.confirmed = "1";
                form.requestSubmit(button);
              });
            }}
          >
            {deletePending ? t("deleting") : t("delete")}
          </button>
          {deleteState.status === "error" ? (
            <p className={clsx(css.note, css.bad)} role="alert">
              {t(`errors.${deleteState.code}`, { max: MAX_SESSION_TASKS })}
            </p>
          ) : null}
        </form>
      ) : session ? (
        <p className={css.hint}>{t("deleteLocked")}</p>
      ) : null}
    </div>
  );
}
