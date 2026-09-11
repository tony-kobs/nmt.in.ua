"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { LOGIN_MAX_LEN } from "@/modules/auth/validateRegistration";
import {
  addTeacherStudentAction,
  unlinkTeacherStudentAction,
  type AddTeacherStudentActionState,
  type UnlinkTeacherStudentActionState,
} from "@/modules/teacher-students/actions";
import css from "./TeacherStudentsPanel.module.css";

const ADD_INITIAL: AddTeacherStudentActionState = { status: "idle" };
const UNLINK_INITIAL: UnlinkTeacherStudentActionState = { status: "idle" };

export type TeacherStudentListItem = {
  studentUserId: number;
  login: string;
  displayName: string;
};

type TeacherStudentsPanelProps = {
  students: TeacherStudentListItem[];
};

export function TeacherStudentsPanel({ students }: TeacherStudentsPanelProps) {
  const t = useTranslations("TeacherStudents");
  const [addState, addAction, addPending] = useActionState(
    addTeacherStudentAction,
    ADD_INITIAL,
  );
  const [unlinkState, unlinkAction, unlinkPending] = useActionState(
    unlinkTeacherStudentAction,
    UNLINK_INITIAL,
  );

  return (
    <div className={css.layout}>
      <section className={css.panel} aria-labelledby="teacher-students-add-title">
        <div>
          <h2 id="teacher-students-add-title" className={css.panelTitle}>
            {t("addTitle")}
          </h2>
          <p className={css.panelLead}>{t("addLead")}</p>
        </div>

        <form action={addAction} className={css.form}>
          <div className={css.formRow}>
            <label className={css.field}>
              <span className={css.label}>{t("login")}</span>
              <input
                className={css.input}
                type="text"
                name="login"
                autoComplete="off"
                spellCheck={false}
                required
                maxLength={LOGIN_MAX_LEN}
                placeholder={t("loginPlaceholder")}
                disabled={addPending}
              />
            </label>
            <button type="submit" className={css.submit} disabled={addPending}>
              {addPending ? t("adding") : t("add")}
            </button>
          </div>
          <span className={css.hint}>{t("loginHint")}</span>
        </form>

        {addState.status === "success" ? (
          <p className={clsx(css.alert, css.alertSuccess)} role="status">
            {t("added", { name: addState.displayName })}
          </p>
        ) : null}

        {addState.status === "error" ? (
          <p className={clsx(css.alert, css.alertError)} role="alert">
            {t(`errors.${addState.code}`)}
          </p>
        ) : null}
      </section>

      <section
        className={css.panel}
        aria-labelledby="teacher-students-list-title"
      >
        <div>
          <h2 id="teacher-students-list-title" className={css.panelTitle}>
            {t("listTitle")}
          </h2>
          <p className={css.panelLead}>{t("listLead")}</p>
        </div>

        {unlinkState.status === "success" ? (
          <p className={clsx(css.alert, css.alertSuccess)} role="status">
            {t("unlinked")}
          </p>
        ) : null}

        {unlinkState.status === "error" ? (
          <p className={clsx(css.alert, css.alertError)} role="alert">
            {t(`errors.${unlinkState.code}`)}
          </p>
        ) : null}

        {students.length === 0 ? (
          <p className={css.empty}>{t("empty")}</p>
        ) : (
          <ul className={css.list}>
            {students.map((student) => (
              <li key={student.studentUserId} className={css.item}>
                <div className={css.identity}>
                  <p className={css.name}>{student.displayName}</p>
                  <p className={css.login}>@{student.login}</p>
                </div>
                <form action={unlinkAction}>
                  <input
                    type="hidden"
                    name="studentUserId"
                    value={student.studentUserId}
                  />
                  <button
                    type="submit"
                    className={css.unlink}
                    disabled={unlinkPending}
                  >
                    {unlinkPending ? t("unlinking") : t("unlink")}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
