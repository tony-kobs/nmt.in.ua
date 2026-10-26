"use client";

import Link from "next/link";
import { guardConfirmedSubmit } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import {
  deleteQuizTaskAction,
  deleteQuizTasksAction,
  updateQuizTaskDifficultyAction,
  updateThemeDifficultyGuideAction,
  type DeleteQuizTaskActionState,
  type DeleteQuizTasksActionState,
} from "@/modules/admin-content/actions";
import { MIN_DIFFICULTY } from "@/modules/content-import/schema";
import {
  MAX_DIFFICULTY_GUIDE_LENGTH,
  type AdminQuizTaskListPage,
  type AdminThemeOption,
} from "@/modules/admin-content/types";
import { queryHref } from "@/lib/queryHref";
import { Select } from "@/components/ui/Select";
import { MathText } from "@/components/ui/MathText";
import css from "./AdminContentEditor.module.css";

const DELETE_INITIAL: DeleteQuizTaskActionState = { status: "idle" };
const DELETE_MANY_INITIAL: DeleteQuizTasksActionState = { status: "idle" };

function formatThemeLabel(index: number, theme: AdminThemeOption): string {
  return `${index + 1}. ${theme.name}`;
}

function listHref(themeId: number | null, page: number): string {
  return queryHref("/", {
    theme: themeId != null ? String(themeId) : null,
    page: page > 1 ? String(page) : null,
  });
}

function DifficultyControl({
  name,
  value,
  disabled,
  onCommit,
}: {
  name: string;
  value: number;
  disabled: boolean;
  onCommit: (next: number) => void;
}) {
  const t = useTranslations("AdminContent");
  const [draft, setDraft] = useState(String(value));
  const [syncedValue, setSyncedValue] = useState(value);
  if (value !== syncedValue) {
    setSyncedValue(value);
    setDraft(String(value));
  }

  function commit(raw: string) {
    const next = Number(raw);
    if (!Number.isInteger(next) || next < MIN_DIFFICULTY) {
      setDraft(String(value));
      return;
    }
    setDraft(String(next));
    if (next !== value) onCommit(next);
  }

  return (
    <input
      className={css.diffValue}
      type="text"
      inputMode="numeric"
      value={draft}
      aria-label={t("difficultyAria", { name })}
      disabled={disabled}
      onChange={(event) => setDraft(event.target.value.replace(/[^\d]/g, ""))}
      onBlur={(event) => commit(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function ThemeDifficultyGuide({
  themeId,
  themeName,
  value,
}: {
  themeId: number;
  themeName: string;
  value: string;
}) {
  const t = useTranslations("AdminContent");
  const router = useRouter();
  const [draft, setDraft] = useState(value);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const [baseline, setBaseline] = useState(value);
  if (value !== baseline) {
    const previous = baseline;
    setBaseline(value);
    setDraft((current) => {
      // Keep keystrokes typed after blur while the save or refresh is in flight.
      if (current.trim() === previous || current.trim() === value) return value;
      return current;
    });
  }

  function commit(raw: string) {
    const next = raw.trim();
    if (next === baseline) return;
    setSaved(false);
    setErrorCode(null);
    startTransition(async () => {
      const result = await updateThemeDifficultyGuideAction(themeId, next);
      if (result.status === "success") {
        setDraft((current) => (current.trim() === next ? next : current));
        setSaved(true);
        router.refresh();
        return;
      }
      setErrorCode(result.code);
    });
  }

  return (
    <div className={css.guideField}>
      <label className={css.themeLabel} htmlFor={`difficulty-guide-${themeId}`}>
        {t("difficultyGuideLabel")}
      </label>
      <textarea
        id={`difficulty-guide-${themeId}`}
        className={clsx(css.input, css.textarea, css.guideInput)}
        value={draft}
        rows={7}
        maxLength={MAX_DIFFICULTY_GUIDE_LENGTH}
        disabled={pending}
        aria-label={t("difficultyGuideAria", { name: themeName })}
        onChange={(event) => {
          setDraft(event.target.value);
          setSaved(false);
          setErrorCode(null);
        }}
        onBlur={(event) => commit(event.currentTarget.value)}
      />
      <p className={css.guideHint}>{t("difficultyGuideHint")}</p>
      {saved ? (
        <p className={clsx(css.alert, css.alertSuccess)} role="status">
          {t("difficultyGuideSaved")}
        </p>
      ) : null}
      {errorCode ? (
        <p className={clsx(css.alert, css.alertError)} role="alert">
          {t(`errors.${errorCode}`)}
        </p>
      ) : null}
    </div>
  );
}

type AdminContentEditorProps = {
  themes: AdminThemeOption[];
  initialThemeId?: number;
  taskPage: AdminQuizTaskListPage;
};

export function AdminContentEditor({
  themes,
  initialThemeId,
  taskPage,
}: AdminContentEditorProps) {
  const t = useTranslations("AdminContent");
  const router = useRouter();
  const [themeId, setThemeId] = useState<number | null>(
    initialThemeId ?? themes[0]?.id ?? null,
  );
  const [, startTransition] = useTransition();

  const [deleteState, deleteAction, deletePending] = useActionState(
    deleteQuizTaskAction,
    DELETE_INITIAL,
  );
  const [bulkState, bulkAction, bulkPending] = useActionState(
    deleteQuizTasksAction,
    DELETE_MANY_INITIAL,
  );
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [difficultyOverrides, setDifficultyOverrides] = useState<
    Record<number, number>
  >({});
  const [difficultyError, setDifficultyError] = useState<string | null>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const difficultyQueue = useRef<Map<number, number>>(new Map());
  const difficultyInflight = useRef<Set<number>>(new Set());
  const busy = deletePending || bulkPending;

  useEffect(() => {
    if (deleteState.status === "success" || bulkState.status === "success") {
      startTransition(() => {
        router.refresh();
      });
    }
  }, [deleteState, bulkState, router, startTransition]);

  function onThemeChange(next: number) {
    setThemeId(next);
    startTransition(() => {
      router.push(listHref(next, 1));
    });
  }

  const selectedTheme = themes.find((theme) => theme.id === themeId);
  const tasks = taskPage.items;
  const { page, totalPages, total } = taskPage;
  const showPager = totalPages > 1;
  const pageIds = tasks.map((task) => task.id);
  const visibleKey = `${themeId ?? ""}:${page}:${pageIds.join(",")}`;
  const selectedIds = pageIds.filter((id) => selected.has(id));
  const allOnPage = pageIds.length > 0 && selectedIds.length === pageIds.length;
  const [selectionScope, setSelectionScope] = useState(visibleKey);
  if (selectionScope !== visibleKey) {
    setSelectionScope(visibleKey);
    setSelected(new Set());
  }

  useEffect(() => {
    if (!selectAllRef.current) return;
    selectAllRef.current.indeterminate =
      selectedIds.length > 0 && !allOnPage;
  }, [selectedIds.length, allOnPage]);

  function toggleTask(id: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function togglePage(checked: boolean) {
    setSelected(checked ? new Set(pageIds) : new Set());
  }

  const difficultyKey = tasks
    .map((task) => `${task.id}:${task.difficulty}`)
    .join(",");
  const [overrideScope, setOverrideScope] = useState(difficultyKey);
  if (overrideScope !== difficultyKey) {
    setOverrideScope(difficultyKey);
    setDifficultyOverrides((current) => {
      let changed = false;
      const next = { ...current };
      for (const task of tasks) {
        if (next[task.id] === task.difficulty) {
          delete next[task.id];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }

  function shownDifficulty(taskId: number, stored: number): number {
    return difficultyOverrides[taskId] ?? stored;
  }

  function commitDifficulty(taskId: number, stored: number, next: number) {
    if (!Number.isInteger(next) || next < MIN_DIFFICULTY) return;
    if (next === shownDifficulty(taskId, stored)) return;
    setDifficultyError(null);
    setDifficultyOverrides((current) => ({ ...current, [taskId]: next }));
    difficultyQueue.current.set(taskId, next);
    if (difficultyInflight.current.has(taskId)) return;
    difficultyInflight.current.add(taskId);

    void (async () => {
      let failed = false;
      try {
        while (difficultyQueue.current.has(taskId)) {
          const value = difficultyQueue.current.get(taskId);
          difficultyQueue.current.delete(taskId);
          if (value == null) break;
          const result = await updateQuizTaskDifficultyAction(taskId, value);
          if (result.status === "error" && !difficultyQueue.current.has(taskId)) {
            failed = true;
            setDifficultyOverrides((current) => {
              const copy = { ...current };
              delete copy[taskId];
              return copy;
            });
            setDifficultyError(result.code);
            break;
          }
        }
      } finally {
        difficultyInflight.current.delete(taskId);
        if (!failed) {
          startTransition(() => {
            router.refresh();
          });
        }
      }
    })();
  }

  return (
    <div className={css.layout}>
      <section className={css.panel} aria-labelledby="admin-theme-title">
        <h2 id="admin-theme-title" className={css.srOnly}>
          {t("themeTitle")}
        </h2>
        <label className={css.themeField}>
          <span className={css.themeLabel}>{t("chooseTheme")}</span>
          <Select
            value={themeId != null ? String(themeId) : ""}
            placeholder={t("noThemes")}
            disabled={themes.length === 0}
            options={themes.map((theme, index) => ({
              value: String(theme.id),
              label: formatThemeLabel(index, theme),
            }))}
            onChange={(next) => {
              const parsed = Number(next);
              if (Number.isInteger(parsed) && parsed > 0) onThemeChange(parsed);
            }}
          />
        </label>
        {selectedTheme ? (
          <>
            <p className={css.themeMeta}>
              {t("taskCount", { count: selectedTheme.taskCount })}
            </p>
            <ThemeDifficultyGuide
              key={selectedTheme.id}
              themeId={selectedTheme.id}
              themeName={selectedTheme.name}
              value={selectedTheme.difficultyGuide}
            />
          </>
        ) : null}
      </section>

      <section className={css.panel} aria-labelledby="admin-tasks-title">
        <div className={css.listHeader}>
          <div>
            <h2 id="admin-tasks-title" className={css.panelTitle}>
              {t("listTitle")}
            </h2>
            <p className={css.panelLead}>{t("listLead")}</p>
          </div>
          {themeId ? (
            <Link
              href={`/tasks/new?theme=${themeId}`}
              className={css.createBtn}
            >
              {t("create")}
            </Link>
          ) : (
            <button type="button" className={css.createBtn} disabled>
              {t("create")}
            </button>
          )}
        </div>

        {deleteState.status === "error" ? (
          <p className={clsx(css.alert, css.alertError)} role="alert">
            {t(`errors.${deleteState.code}`)}
          </p>
        ) : null}
        {bulkState.status === "error" ? (
          <p className={clsx(css.alert, css.alertError)} role="alert">
            {t(`errors.${bulkState.code}`)}
          </p>
        ) : null}
        {deleteState.status === "success" ? (
          <p className={clsx(css.alert, css.alertSuccess)} role="status">
            {t("deleted")}
          </p>
        ) : null}
        {bulkState.status === "success" ? (
          <p className={clsx(css.alert, css.alertSuccess)} role="status">
            {t("deletedMany", { count: bulkState.count })}
          </p>
        ) : null}
        {difficultyError ? (
          <p className={clsx(css.alert, css.alertError)} role="alert">
            {t(`errors.${difficultyError}`)}
          </p>
        ) : null}

        {tasks.length === 0 ? (
          <p className={css.empty}>{t("empty")}</p>
        ) : (
          <>
            <form
              className={css.bulkBar}
              action={bulkAction}
              onSubmit={(event) => {
                if (selectedIds.length === 0) {
                  event.preventDefault();
                  return;
                }
                const anyInUse = tasks.some(
                  (task) => selected.has(task.id) && task.inUse,
                );
                const key = anyInUse
                  ? "deleteSelectedConfirmInUse"
                  : "deleteSelectedConfirm";
                guardConfirmedSubmit(event, t(key, { count: selectedIds.length }));
              }}
            >
              {selectedIds.map((id) => (
                <input key={id} type="hidden" name="taskId" value={id} />
              ))}
              <p className={css.bulkHint}>{t("deleteSelectedHint")}</p>
              <button
                type="submit"
                className={css.bulkDeleteBtn}
                disabled={selectedIds.length === 0 || busy}
              >
                {bulkPending
                  ? t("deleting")
                  : t("deleteSelected", { count: selectedIds.length })}
              </button>
            </form>
            <div className={css.tableWrap}>
              <table className={css.table}>
                <thead>
                  <tr>
                    <th scope="col" className={css.colCheck}>
                      <label className={css.checkHit}>
                        <input
                          ref={selectAllRef}
                          type="checkbox"
                          checked={allOnPage}
                          disabled={busy || pageIds.length === 0}
                          aria-label={t("selectAllAria")}
                          onChange={(event) => togglePage(event.target.checked)}
                        />
                      </label>
                    </th>
                    <th scope="col">{t("colDescription")}</th>
                    <th scope="col" className={css.colDifficulty}>
                      {t("colDifficulty")}
                    </th>
                    <th scope="col" className={css.colAction}>
                      {t("colEdit")}
                    </th>
                    <th scope="col" className={css.colAction}>
                      {t("colDelete")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((task) => (
                    <tr key={task.id}>
                      <td className={css.colCheck}>
                        <label className={css.checkHit}>
                          <input
                            type="checkbox"
                            checked={selected.has(task.id)}
                            disabled={busy}
                            aria-label={t("selectAria", { name: task.label })}
                            onChange={() => toggleTask(task.id)}
                          />
                        </label>
                      </td>
                      <td>
                        <span className={css.taskPreview}>
                          <MathText text={task.taskText} />
                        </span>
                      </td>
                      <td className={css.colDifficulty}>
                        <DifficultyControl
                          name={task.label}
                          value={shownDifficulty(task.id, task.difficulty)}
                          disabled={busy}
                          onCommit={(next) =>
                            commitDifficulty(task.id, task.difficulty, next)
                          }
                        />
                      </td>
                      <td className={css.colAction}>
                        <Link
                          href={`/tasks/${task.id}`}
                          className={css.editBtn}
                          aria-label={t("editAria", { name: task.label })}
                        >
                          <span aria-hidden>|</span>
                        </Link>
                      </td>
                      <td className={css.colAction}>
                        <form
                          action={deleteAction}
                          onSubmit={(event) => {
                            const key = task.inUse
                              ? "deleteConfirmInUse"
                              : "deleteConfirm";
                            guardConfirmedSubmit(event, t(key, { name: task.label }));
                          }}
                        >
                          <input type="hidden" name="taskId" value={task.id} />
                          <button
                            type="submit"
                            className={css.deleteBtn}
                            aria-label={t("deleteAria", { name: task.label })}
                            disabled={busy}
                          >
                            <span aria-hidden>×</span>
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {showPager ? (
              <nav className={css.pager} aria-label={t("pagerAria")}>
                {page > 1 ? (
                  <Link
                    href={listHref(themeId, page - 1)}
                    className={css.pagerBtn}
                  >
                    ← {t("prevPage")}
                  </Link>
                ) : (
                  <span className={clsx(css.pagerBtn, css.pagerBtnDisabled)}>
                    ← {t("prevPage")}
                  </span>
                )}
                <p className={css.pagerStatus}>
                  {t("pageStatus", { page, totalPages, total })}
                </p>
                {page < totalPages ? (
                  <Link
                    href={listHref(themeId, page + 1)}
                    className={css.pagerBtn}
                  >
                    {t("nextPage")} →
                  </Link>
                ) : (
                  <span className={clsx(css.pagerBtn, css.pagerBtnDisabled)}>
                    {t("nextPage")} →
                  </span>
                )}
              </nav>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
