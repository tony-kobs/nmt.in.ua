"use client";

import { useId, useReducer, useRef, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Select } from "@/components/ui/Select";
import type { AuthUser } from "@/modules/auth/types";
import { createParentInviteAction } from "@/modules/parent-students/actions";
import { canShowParentInvites, INITIAL_PARENT_INVITE, parentInviteReducer } from "./parentInviteState";
import panel from "@/components/dashboard/TeacherStudentsPanel/TeacherStudentsPanel.module.css";
import share from "@/components/dashboard/InviteShare/InviteShare.module.css";
import css from "./ParentInvitePanel.module.css";

type Props = {
  user: Pick<AuthUser, "id" | "role" | "realRole">;
  students?: { studentUserId: number; displayName: string; login: string }[];
};

export function ParentInvitePanel({ user, students = [] }: Props) {
  const t = useTranslations("ParentInvites");
  const locale = useLocale();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const [state, dispatch] = useReducer(parentInviteReducer, INITIAL_PARENT_INVITE);
  if (!canShowParentInvites(user)) return null;
  const teacher = user.role === "teacher";
  const selected = !teacher || students.some((student) => String(student.studentUserId) === state.studentId);

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || !selected) return;
    inFlight.current = true;
    const studentId = state.studentId;
    dispatch({ type: "start" });
    try {
      const form = new FormData();
      if (teacher) form.set("studentId", studentId);
      const result = await createParentInviteAction(form);
      dispatch({ type: "result", studentId, result });
    } catch {
      dispatch({ type: "result", studentId, result: { status: "error", code: "generic" } });
    } finally { inFlight.current = false; }
  }

  async function copy() {
    if (!selected || state.result?.status !== "success") return;
    const url = state.result.url;
    try {
      await navigator.clipboard.writeText(url);
      dispatch({ type: "copy", url, status: "copied" });
    } catch {
      dispatch({ type: "copy", url, status: "failed" });
      input.current?.focus(); input.current?.select();
    }
  }

  return (
    <section className={`${panel.panel} ${css.panel}`} aria-labelledby={`${id}-title`}>
      <div>
        <h2 id={`${id}-title`} className={panel.panelTitle}>{t("title")}</h2>
        <p className={panel.panelLead}>{t(teacher ? "teacherLead" : "studentLead")}</p>
      </div>
      <form className={css.form} onSubmit={create} aria-busy={state.pending}>
        {teacher ? students.length ? (
          <div className={share.field}>
            <label id={`${id}-student-label`} className={share.label} htmlFor={`${id}-student`}>{t("student")}</label>
            <Select id={`${id}-student`} aria-labelledby={`${id}-student-label`}
              value={state.studentId} placeholder={t("chooseStudent")} disabled={state.pending}
              options={students.map((student) => ({ value: String(student.studentUserId), label: `${student.displayName} (@${student.login})` }))}
              onChange={(studentId) => dispatch({ type: "select", studentId })} />
          </div>
        ) : <p className={panel.panelLead} role="status">{t("noStudents")}</p> : null}
        <button className={css.create} type="submit" disabled={state.pending || !selected}>
          {t(state.pending ? "creating" : "create")}
        </button>
      </form>
      {state.result?.status === "error" ? (
        <p className={panel.alertError} role="alert">{t(`errors.${state.result.code}`)}</p>
      ) : null}
      {selected && state.result?.status === "success" ? (
        <div className={share.share}>
          <label className={share.field}>
            <span className={share.label}>{t("link")}</span>
            <input ref={input} className={share.input} value={state.result.url} readOnly spellCheck={false}
              autoComplete="off" onFocus={(event) => event.currentTarget.select()} />
          </label>
          <button className={share.copy} type="button" onClick={() => void copy()}>{t(state.copy === "copied" ? "copied" : "copy")}</button>
          <p className={share.expires}>{t("expires", { when: new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(state.result.expiresAt)) })}</p>
          <p className={panel.panelLead}>{t("privacy")}</p>
          <p className={css.status} role="status" aria-live="polite">
            {state.copy === "failed" ? t("copyFailed") : state.copy === "copied" ? t("copied") : t("ready")}
          </p>
        </div>
      ) : null}
    </section>
  );
}
