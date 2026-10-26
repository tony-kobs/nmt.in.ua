"use client";

import { useActionState, useMemo, useState } from "react";
import { askConfirm } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { Select } from "@/components/ui/Select";
import type { AvailableTopicTheme } from "@/modules/testing/types";
import type {
  MentorAssignmentDetail,
  MentorAssignmentSummary,
  MemberProgressStatus,
} from "@/modules/mentor-assignments/types";
import {
  cancelMentorAssignmentAction,
  createMentorAssignmentAction,
  updateMentorAssignmentMembersAction,
  type MentorAssignmentActionState,
} from "@/modules/mentor-assignments/actions";
import css from "./TeacherAssignWorkspace.module.css";

const IDLE: MentorAssignmentActionState = { status: "idle" };

export type AssignStudentOption = {
  studentUserId: number;
  login: string;
  displayName: string;
};

type TeacherAssignWorkspaceProps = {
  themes: AvailableTopicTheme[];
  students: AssignStudentOption[];
  assignments: MentorAssignmentSummary[];
  /** Preloaded details keyed by assignment id for first paint. */
  detailsById: Record<number, MentorAssignmentDetail>;
};

function formatDueAt(unixSec: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(unixSec * 1000));
}

function progressClass(status: MemberProgressStatus): string {
  switch (status) {
    case "completed":
      return css.memberCompleted;
    case "overdue":
      return css.memberOverdue;
    default:
      return css.memberPending;
  }
}

export function TeacherAssignWorkspace({
  themes,
  students,
  assignments,
  detailsById,
}: TeacherAssignWorkspaceProps) {
  const t = useTranslations("TeacherAssign");
  const dateLocale =
    typeof document !== "undefined"
      ? document.documentElement.lang || "uk-UA"
      : "uk-UA";

  const [scheduleMode, setScheduleMode] = useState<"now" | "datetime">("now");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(
    () => new Set(students.map((s) => s.studentUserId))
  );
  const [pickedId, setPickedId] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [editIds, setEditIds] = useState<Set<number>>(new Set());
  const [sortBy, setSortBy] = useState<"newest" | "opens" | "due" | "theme">(
    "newest"
  );
  const [filterThemeId, setFilterThemeId] = useState<string>("all");
  const [filterProgress, setFilterProgress] = useState<
    "all" | "pending" | "overdue" | "done"
  >("all");

  const [createState, createAction, createPending] = useActionState(
    createMentorAssignmentAction,
    IDLE
  );
  const [cancelState, cancelAction, cancelPending] = useActionState(
    cancelMentorAssignmentAction,
    IDLE
  );
  const [updateState, updateAction, updatePending] = useActionState(
    async (
      prev: MentorAssignmentActionState,
      formData: FormData
    ): Promise<MentorAssignmentActionState> => {
      const result = await updateMentorAssignmentMembersAction(prev, formData);
      if (result.status === "success") {
        setEditing(false);
      }
      return result;
    },
    IDLE
  );

  const preferredId =
    createState.status === "success"
      ? (createState.assignmentId ?? null)
      : null;

  const filteredAssignments = useMemo(() => {
    let rows = [...assignments];
    if (filterThemeId !== "all") {
      const themeId = Number(filterThemeId);
      rows = rows.filter((row) => row.themeId === themeId);
    }
    if (filterProgress === "overdue") {
      rows = rows.filter((row) => row.overdueCount > 0);
    } else if (filterProgress === "pending") {
      rows = rows.filter(
        (row) => row.completedCount + row.overdueCount < row.memberCount
      );
    } else if (filterProgress === "done") {
      rows = rows.filter(
        (row) => row.memberCount > 0 && row.completedCount === row.memberCount
      );
    }
    rows.sort((a, b) => {
      switch (sortBy) {
        case "opens":
          return a.availableAt - b.availableAt || b.id - a.id;
        case "due":
          return a.dueAt - b.dueAt || b.id - a.id;
        case "theme":
          return (
            a.themeName.localeCompare(b.themeName, dateLocale) || b.id - a.id
          );
        case "newest":
        default:
          return b.createdAt - a.createdAt || b.id - a.id;
      }
    });
    return rows;
  }, [assignments, filterThemeId, filterProgress, sortBy, dateLocale]);

  const activeId = useMemo(() => {
    const candidate =
      pickedId ?? preferredId ?? filteredAssignments[0]?.id ?? null;
    if (candidate == null) return null;
    if (!filteredAssignments.some((row) => row.id === candidate)) {
      return filteredAssignments[0]?.id ?? null;
    }
    return candidate;
  }, [pickedId, preferredId, filteredAssignments]);

  const activeDetail =
    activeId == null ? null : (detailsById[activeId] ?? null);

  function openAssignment(id: number) {
    setPickedId(id);
    setEditing(false);
  }

  function startEditing() {
    if (!activeDetail) return;
    setEditIds(new Set(activeDetail.members.map((m) => m.studentUserId)));
    setEditing(true);
  }

  function toggleStudent(id: number, on: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleEditStudent(id: number, on: boolean) {
    setEditIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  if (themes.length === 0) {
    return <p className={css.empty}>{t("noThemes")}</p>;
  }

  return (
    <div className={css.layout}>
      <section
        className={css.panel}
        aria-labelledby="teacher-assign-form-title"
      >
        <h2 id="teacher-assign-form-title" className={css.panelTitle}>
          {t("formTitle")}
        </h2>
        <p className={css.panelLead}>{t("formLead")}</p>

        {students.length === 0 ? (
          <p className={css.empty}>{t("noStudents")}</p>
        ) : (
          <form action={createAction} className={css.form}>
            <label className={css.field}>
              <span className={css.label}>{t("topic")}</span>
              <Select
                name="themeId"
                defaultValue={String(themes[0]!.id)}
                disabled={createPending}
                required
                options={themes.map((theme) => ({
                  value: String(theme.id),
                  label: theme.name,
                }))}
              />
            </label>

            <label className={css.field}>
              <span className={css.label}>{t("difficulty")}</span>
              <input
                className={css.input}
                type="number"
                name="difficulty"
                min="1"
                step="1"
                defaultValue="1"
                required
                disabled={createPending}
              />
            </label>

            <fieldset className={css.fieldset}>
              <legend className={css.label}>{t("when")}</legend>
              <div className={css.scheduleRow}>
                <label className={css.radio}>
                  <input
                    type="radio"
                    name="scheduleMode"
                    value="now"
                    checked={scheduleMode === "now"}
                    onChange={() => setScheduleMode("now")}
                    disabled={createPending}
                  />
                  <span>{t("scheduleNow")}</span>
                </label>
                <label className={css.radio}>
                  <input
                    type="radio"
                    name="scheduleMode"
                    value="datetime"
                    checked={scheduleMode === "datetime"}
                    onChange={() => setScheduleMode("datetime")}
                    disabled={createPending}
                  />
                  <span>{t("scheduleDatetime")}</span>
                </label>
              </div>
              {scheduleMode === "datetime" ? (
                <label className={css.field}>
                  <span className={css.label}>{t("availableAt")}</span>
                  <input
                    className={css.input}
                    type="datetime-local"
                    name="availableAtLocal"
                    required
                    disabled={createPending}
                  />
                </label>
              ) : null}
              <label className={css.field}>
                <span className={css.label}>{t("dueAt")}</span>
                <input
                  className={css.input}
                  type="datetime-local"
                  name="dueAtLocal"
                  required
                  disabled={createPending}
                />
              </label>
            </fieldset>

            <fieldset className={css.fieldset}>
              <legend className={css.label}>{t("students")}</legend>
              <ul className={css.checkList}>
                {students.map((student) => {
                  const checked = selectedIds.has(student.studentUserId);
                  return (
                    <li key={student.studentUserId}>
                      <label className={css.check}>
                        <input
                          type="checkbox"
                          name="studentIds"
                          value={student.studentUserId}
                          checked={checked}
                          onChange={(event) =>
                            toggleStudent(
                              student.studentUserId,
                              event.target.checked
                            )
                          }
                          disabled={createPending}
                        />
                        <span>
                          {student.displayName}{" "}
                          <span className={css.login}>@{student.login}</span>
                        </span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </fieldset>

            <button
              type="submit"
              className={css.submit}
              disabled={createPending || selectedIds.size === 0}
            >
              {createPending ? t("assigning") : t("assign")}
            </button>

            {createState.status === "success" ? (
              <p className={clsx(css.alert, css.success)} role="status">
                {t("created")}
              </p>
            ) : null}
            {createState.status === "error" ? (
              <p className={clsx(css.alert, css.error)} role="alert">
                {t(`errors.${createState.code}`)}
              </p>
            ) : null}
          </form>
        )}
      </section>

      <section
        className={css.panel}
        aria-labelledby="teacher-assign-list-title"
      >
        <h2 id="teacher-assign-list-title" className={css.panelTitle}>
          {t("listTitle")}
        </h2>
        <p className={css.panelLead}>{t("listLead")}</p>

        {assignments.length === 0 ? (
          <p className={css.empty}>{t("listEmpty")}</p>
        ) : (
          <>
            <div className={css.listToolbar}>
              <label className={css.field}>
                <span className={css.label}>{t("sortBy")}</span>
                <Select
                  value={sortBy}
                  onChange={(value) =>
                    setSortBy(value as "newest" | "opens" | "due" | "theme")
                  }
                  options={[
                    { value: "newest", label: t("sortNewest") },
                    { value: "opens", label: t("sortOpens") },
                    { value: "due", label: t("sortDue") },
                    { value: "theme", label: t("sortTheme") },
                  ]}
                />
              </label>
              <label className={css.field}>
                <span className={css.label}>{t("filterTheme")}</span>
                <Select
                  value={filterThemeId}
                  onChange={setFilterThemeId}
                  options={[
                    { value: "all", label: t("filterAll") },
                    ...themes.map((theme) => ({
                      value: String(theme.id),
                      label: theme.name,
                    })),
                  ]}
                />
              </label>
              <label className={css.field}>
                <span className={css.label}>{t("filterProgress")}</span>
                <Select
                  value={filterProgress}
                  onChange={(value) =>
                    setFilterProgress(
                      value as "all" | "pending" | "overdue" | "done"
                    )
                  }
                  options={[
                    { value: "all", label: t("filterAll") },
                    { value: "pending", label: t("filterPending") },
                    { value: "overdue", label: t("filterOverdue") },
                    { value: "done", label: t("filterDone") },
                  ]}
                />
              </label>
            </div>

            {filteredAssignments.length === 0 ? (
              <p className={css.empty}>{t("filterEmpty")}</p>
            ) : (
              <ul className={css.assignList}>
                {filteredAssignments.map((row) => {
                  const active = row.id === activeId;
                  return (
                    <li key={row.id}>
                      <button
                        type="button"
                        className={clsx(
                          css.assignItem,
                          active && css.assignActive
                        )}
                        onClick={() => openAssignment(row.id)}
                        aria-expanded={active}
                      >
                        <span className={css.assignTheme}>{row.themeName}</span>
                        <span className={css.assignMeta}>
                          {t("opensLabel", {
                            date: formatDueAt(row.availableAt, dateLocale),
                          })}
                          {" · "}
                          {t("dueLabel", {
                            date: formatDueAt(row.dueAt, dateLocale),
                          })}
                          {" · "}
                          {t("counts", {
                            done: row.completedCount,
                            overdue: row.overdueCount,
                            total: row.memberCount,
                          })}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </>
        )}

        {activeDetail ? (
          <div className={css.detail} aria-live="polite">
            <h3 className={css.detailTitle}>{activeDetail.themeName}</h3>
            <p className={css.detailLead}>
              {t("opensLabel", {
                date: formatDueAt(activeDetail.availableAt, dateLocale),
              })}
              {" · "}
              {t("dueLabel", {
                date: formatDueAt(activeDetail.dueAt, dateLocale),
              })}
            </p>

            <ul className={css.memberList}>
              {activeDetail.members.map((member) => (
                <li
                  key={member.studentUserId}
                  className={clsx(css.member, progressClass(member.progress))}
                >
                  <span>
                    {member.displayName}{" "}
                    <span className={css.login}>@{member.login}</span>
                  </span>
                  <span className={css.memberStatus}>
                    {t(`progress.${member.progress}`)}
                  </span>
                </li>
              ))}
            </ul>

            <div className={css.actions}>
              <form action={cancelAction}>
                <input
                  type="hidden"
                  name="assignmentId"
                  value={activeDetail.id}
                />
                <button
                  type="submit"
                  className={css.danger}
                  disabled={cancelPending}
                  onClick={(event) => {
                    const button = event.currentTarget;
                    const form = button.form;
                    if (button.dataset.confirmed === "1") {
                      delete button.dataset.confirmed;
                      setPickedId(null);
                      setEditing(false);
                      return;
                    }
                    event.preventDefault();
                    void askConfirm(t("cancelConfirm")).then((ok) => {
                      if (!ok || !form) return;
                      button.dataset.confirmed = "1";
                      form.requestSubmit(button);
                      setPickedId(null);
                      setEditing(false);
                    });
                  }}
                >
                  {cancelPending ? t("cancelling") : t("cancel")}
                </button>
              </form>

              <button
                type="button"
                className={css.secondary}
                onClick={() => {
                  if (editing) {
                    setEditing(false);
                  } else {
                    startEditing();
                  }
                }}
              >
                {editing ? t("editClose") : t("editMembers")}
              </button>
            </div>

            {cancelState.status === "error" ? (
              <p className={clsx(css.alert, css.error)} role="alert">
                {t(`errors.${cancelState.code}`)}
              </p>
            ) : null}

            {editing ? (
              <form action={updateAction} className={css.editForm}>
                <input
                  type="hidden"
                  name="assignmentId"
                  value={activeDetail.id}
                />
                <fieldset className={css.fieldset}>
                  <legend className={css.label}>{t("editMembers")}</legend>
                  <ul className={css.checkList}>
                    {students.map((student) => {
                      const completed = activeDetail.members.some(
                        (m) =>
                          m.studentUserId === student.studentUserId &&
                          m.progress === "completed"
                      );
                      const checked =
                        editIds.has(student.studentUserId) || completed;
                      return (
                        <li key={student.studentUserId}>
                          <label className={css.check}>
                            <input
                              type="checkbox"
                              name="studentIds"
                              value={student.studentUserId}
                              checked={checked}
                              disabled={updatePending || completed}
                              onChange={(event) =>
                                toggleEditStudent(
                                  student.studentUserId,
                                  event.target.checked
                                )
                              }
                            />
                            <span>
                              {student.displayName}
                              {completed ? ` (${t("progress.completed")})` : ""}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </fieldset>
                <button
                  type="submit"
                  className={css.submit}
                  disabled={updatePending}
                >
                  {updatePending ? t("saving") : t("saveMembers")}
                </button>
                {updateState.status === "error" ? (
                  <p className={clsx(css.alert, css.error)} role="alert">
                    {t(`errors.${updateState.code}`)}
                  </p>
                ) : null}
              </form>
            ) : null}

            {updateState.status === "success" ? (
              <p className={clsx(css.alert, css.success)} role="status">
                {t("membersSaved")}
              </p>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
