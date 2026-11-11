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
  generateSimilarTasksAction,
  publishQuizTaskAction,
  updateQuizTaskDifficultyAction,
  updateThemeDifficultyGuideAction,
  type DeleteQuizTaskActionState,
  type DeleteQuizTasksActionState,
  type GenerateSimilarState,
  type PublishQuizTaskState,
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
import { ThemeLevelsPanel } from "./ThemeLevelsPanel";
import { ThemeParamsPanel } from "./ThemeParamsPanel";
import css from "./AdminContentEditor.module.css";

const DELETE_INITIAL: DeleteQuizTaskActionState = { status: "idle" };
const DELETE_MANY_INITIAL: DeleteQuizTasksActionState = { status: "idle" };
const GENERATE_INITIAL: GenerateSimilarState = { status: "idle" };
const PUBLISH_INITIAL: PublishQuizTaskState = { status: "idle" };

function formatThemeLabel(index: number, theme: AdminThemeOption): string {
  return `${index + 1}. ${theme.name}`;
}

function listHref(
  themeId: number | null,
  page: number,
  search = "",
  status = "all",
): string {
  const query = search.trim();
  const taskStatus = status === "draft" || status === "published" ? status : null;
  return queryHref("/", {
    theme: themeId != null ? String(themeId) : null,
    page: page > 1 ? String(page) : null,
    q: query || null,
    status: taskStatus,
  });
}

function PencilIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4.5 19.5 5.6 15 15.2 5.4a1.6 1.6 0 0 1 2.3 0l1.1 1.1a1.6 1.6 0 0 1 0 2.3L9 18.4 4.5 19.5Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <path d="m13.8 6.8 3.4 3.4" stroke="currentColor" strokeWidth="1.75" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 7.5h14M9.5 7.4V5.8A1.3 1.3 0 0 1 10.8 4.5h2.4a1.3 1.3 0 0 1 1.3 1.3v1.6M8 7.5l.7 11.2a1.3 1.3 0 0 0 1.3 1.2h3.9a1.3 1.3 0 0 0 1.3-1.2L16 7.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
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
  search?: string;
  status?: string;
  llmEnabled?: boolean;
};

export function AdminContentEditor({
  themes,
  initialThemeId,
  taskPage,
  search = "",
  status = "all",
  llmEnabled = false,
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
  const [generateState, generateAction, generatePending] = useActionState(
    generateSimilarTasksAction,
    GENERATE_INITIAL,
  );
  const [publishState, publishAction, publishPending] = useActionState(
    publishQuizTaskAction,
    PUBLISH_INITIAL,
  );
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [difficultyOverrides, setDifficultyOverrides] = useState<
    Record<number, number>
  >({});
  const [difficultyError, setDifficultyError] = useState<string | null>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);
  const difficultyQueue = useRef<Map<number, number>>(new Map());
  const difficultyInflight = useRef<Set<number>>(new Set());
  const busy = deletePending || bulkPending || generatePending || publishPending;

  useEffect(() => {
    if (
      deleteState.status === "success" ||
      bulkState.status === "success" ||
      generateState.status === "success" ||
      publishState.status === "success"
    ) {
      startTransition(() => {
        router.refresh();
      });
    }
  }, [deleteState, bulkState, generateState, publishState, router, startTransition]);

  function onThemeChange(next: number) {
    setThemeId(next);
    startTransition(() => {
      router.push(listHref(next, 1, "", status));
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
            <ThemeParamsPanel
              key={`params-${selectedTheme.id}`}
              themeId={selectedTheme.id}
              params={selectedTheme.params}
            />
            <ThemeLevelsPanel
              key={`levels-${selectedTheme.id}`}
              themeId={selectedTheme.id}
              params={selectedTheme.params}
              levels={selectedTheme.levels}
              taskIds={selectedTheme.taskIds}
              marks={selectedTheme.marks}
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

        {themeId ? (
          <>
          <form className={css.search} action="/" method="get">
            <input type="hidden" name="theme" value={themeId} />
            {status === "draft" || status === "published" ? (
              <input type="hidden" name="status" value={status} />
            ) : null}
            <label className={css.searchLabel} htmlFor="admin-task-search">
              {t("searchLabel")}
            </label>
            <input
              id="admin-task-search"
              key={`${themeId ?? ""}:${search}`}
              className={css.input}
              type="search"
              name="q"
              defaultValue={search}
              placeholder={t("searchPlaceholder")}
              autoComplete="off"
              maxLength={80}
            />
            <button type="submit" className={css.searchBtn}>
              {t("search")}
            </button>
          </form>
          <label className={css.statusField}>
            <span className={css.searchLabel}>{t("statusLabel")}</span>
            <Select
              value={status === "draft" || status === "published" ? status : "all"}
              options={[
                { value: "all", label: t("statusAll") },
                { value: "published", label: t("statusPublished") },
                { value: "draft", label: t("statusDraft") },
              ]}
              onChange={(next) => {
                startTransition(() => {
                  router.push(listHref(themeId, 1, search, next));
                });
              }}
            />
          </label>
          </>
        ) : null}

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
        {difficultyError ? (
          <p className={clsx(css.alert, css.alertError)} role="alert">
            {t(`errors.${difficultyError}`)}
          </p>
        ) : null}

        {tasks.length === 0 ? (
          <p className={css.empty}>
            {search.trim()
              ? t("searchEmpty")
              : status === "draft"
                ? t("emptyDrafts")
                : status === "published"
                  ? t("emptyPublished")
                  : t("empty")}
          </p>
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
                          tabIndex={-1}
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
                            tabIndex={-1}
                            aria-label={t("selectAria", { name: task.label })}
                            onChange={() => toggleTask(task.id)}
                          />
                        </label>
                      </td>
                      <td className={css.colTask}>
                        <span className={css.taskId}>#{task.id}</span>
                        {task.status === "draft" ? (
                          <span className={css.badgeDraft}>{t("badgeDraft")}</span>
                        ) : null}
                        {task.sourceTaskId ? (
                          <Link href={`/tasks/${task.sourceTaskId}`} className={css.sourceLink}>
                            {t("sourceTask", { id: task.sourceTaskId })}
                          </Link>
                        ) : null}
                        {task.name && !task.taskText.includes(task.name) ? (
                          <span className={css.taskName}>{task.name}</span>
                        ) : null}
                        <span className={css.taskPreview}>
                          <MathText text={task.taskText} />
                        </span>
                        {llmEnabled ? (
                          <form action={generateAction} className={css.generateForm}>
                            <input type="hidden" name="taskId" value={task.id} />
                            <label className={css.generateCount}>
                              <span className={css.srOnly}>{t("generateCount")}</span>
                              <input
                                className={css.countInput}
                                type="number"
                                name="count"
                                min={1}
                                max={5}
                                defaultValue={3}
                                inputMode="numeric"
                                aria-label={t("generateCountAria", { name: task.label })}
                                disabled={busy}
                              />
                            </label>
                            <button type="submit" className={css.generateBtn} disabled={busy}>
                              {generatePending ? t("generating") : t("generateSimilar")}
                            </button>
                          </form>
                        ) : null}
                        {task.status === "draft" ? (
                          <form action={publishAction} className={css.generateForm}>
                            <input type="hidden" name="taskId" value={task.id} />
                            <button type="submit" className={css.publishBtn} disabled={busy}>
                              {publishPending ? t("publishing") : t("publish")}
                            </button>
                          </form>
                        ) : null}
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
                          tabIndex={-1}
                          aria-label={t("editAria", { name: task.label })}
                        >
                          <PencilIcon />
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
                            tabIndex={-1}
                            aria-label={t("deleteAria", { name: task.label })}
                            disabled={busy}
                          >
                            <TrashIcon />
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
                    href={listHref(themeId, page - 1, search, status)}
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
                    href={listHref(themeId, page + 1, search, status)}
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
