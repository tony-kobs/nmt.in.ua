"use client";

import { useActionState, useState, type FormEvent } from "react";
import { guardConfirmedSubmit } from "@/components/ui/ConfirmDialog/ConfirmDialog";
import Link from "next/link";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { Select } from "@/components/ui/Select";
import {
  EMAIL_MAX_LEN,
  isValidEmailAddress,
  LOGIN_MAX_LEN,
  PASSWORD_MAX_LEN,
  PASSWORD_MIN_LEN,
} from "@/modules/auth/validateRegistration";
import {
  addTeacherStudentAction,
  unlinkTeacherStudentAction,
  type AddTeacherStudentActionState,
  type UnlinkTeacherStudentActionState,
} from "@/modules/teacher-students/actions";
import {
  assignStudentGroupAction,
  createStudentAccountAction,
  type CreateStudentActionState,
  type GroupActionState,
} from "@/modules/teacher-students/manageActions";
import css from "./TeacherStudentsPanel.module.css";

const ADD_INITIAL: AddTeacherStudentActionState = { status: "idle" };
const CREATE_INITIAL: CreateStudentActionState = { status: "idle" };
const UNLINK_INITIAL: UnlinkTeacherStudentActionState = { status: "idle" };
const ASSIGN_INITIAL: GroupActionState = { status: "idle" };

export type TeacherStudentListItem = {
  studentUserId: number;
  login: string;
  displayName: string;
  groupId: number | null;
  groupName: string | null;
};

export type TeacherStudentGroupOption = {
  id: number;
  name: string;
};

type TeacherStudentsPanelProps = {
  students: TeacherStudentListItem[];
  groups: TeacherStudentGroupOption[];
};

export function TeacherStudentsPanel({
  students,
  groups,
}: TeacherStudentsPanelProps) {
  const t = useTranslations("TeacherStudents");
  const [addState, addAction, addPending] = useActionState(
    addTeacherStudentAction,
    ADD_INITIAL,
  );
  const [createState, createAction, createPending] = useActionState(
    createStudentAccountAction,
    CREATE_INITIAL,
  );
  const [copiedLogin, setCopiedLogin] = useState<string | null>(null);
  const [createEmailInvalid, setCreateEmailInvalid] = useState(false);
  const credentialsCopied =
    createState.status === "success" && copiedLogin === createState.login;
  const [unlinkState, unlinkAction, unlinkPending] = useActionState(
    unlinkTeacherStudentAction,
    UNLINK_INITIAL,
  );
  const [assignState, assignAction, assignPending] = useActionState(
    assignStudentGroupAction,
    ASSIGN_INITIAL,
  );
  const groupOptions = [
    { value: "", label: t("noGroup") },
    ...groups.map((group) => ({
      value: String(group.id),
      label: group.name,
    })),
  ];

  async function copyCredentials() {
    if (createState.status !== "success") return;
    const lines = [
      `${t("loginNew")}: ${createState.login}`,
      `${t("email")}: ${createState.email}`,
      `${t("password")}: ${createState.password}`,
    ];
    if (createState.groupName) {
      lines.push(`${t("groupOptional")}: ${createState.groupName}`);
    }
    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setCopiedLogin(createState.login);
    } catch {
      setCopiedLogin(null);
    }
  }

  return (
    <div className={css.layout}>
      <section
        className={css.panel}
        aria-labelledby="teacher-students-create-title"
      >
        <div>
          <h2 id="teacher-students-create-title" className={css.panelTitle}>
            {t("createTitle")}
          </h2>
          <p className={css.panelLead}>{t("createLead")}</p>
        </div>

        <form
          key={
            createState.status === "success" ? createState.login : "create-draft"
          }
          action={createAction}
          className={css.form}
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            const value = String(new FormData(event.currentTarget).get("email") ?? "");
            if (!isValidEmailAddress(value)) {
              event.preventDefault();
              setCreateEmailInvalid(true);
              return;
            }
            setCreateEmailInvalid(false);
          }}
        >
          <div className={css.fields}>
            <label className={css.field}>
              <span className={css.label}>{t("loginNew")}</span>
              <input
                className={css.input}
                type="text"
                name="login"
                autoComplete="off"
                spellCheck={false}
                required
                maxLength={LOGIN_MAX_LEN}
                placeholder={t("loginNewPlaceholder")}
                disabled={createPending}
              />
            </label>
            <label className={css.field}>
              <span className={css.label}>{t("email")}</span>
              <input
                className={css.input}
                type="text"
                inputMode="email"
                name="email"
                autoComplete="off"
                spellCheck={false}
                required
                maxLength={EMAIL_MAX_LEN}
                placeholder={t("emailPlaceholder")}
                disabled={createPending}
                aria-invalid={createEmailInvalid || undefined}
                onInvalid={(event) => {
                  if (event.currentTarget.validity.valueMissing) return;
                  event.preventDefault();
                  setCreateEmailInvalid(true);
                }}
                onChange={() => setCreateEmailInvalid(false)}
              />
            </label>
            <label className={css.field}>
              <span className={css.label}>{t("password")}</span>
              <input
                className={css.input}
                type="password"
                name="password"
                autoComplete="new-password"
                required
                minLength={PASSWORD_MIN_LEN}
                maxLength={PASSWORD_MAX_LEN}
                disabled={createPending}
              />
            </label>
            <label className={css.field}>
              <span className={css.label}>{t("passwordConfirm")}</span>
              <input
                className={css.input}
                type="password"
                name="passwordConfirm"
                autoComplete="new-password"
                required
                minLength={PASSWORD_MIN_LEN}
                maxLength={PASSWORD_MAX_LEN}
                disabled={createPending}
              />
            </label>
            {groups.length > 0 ? (
              <div className={clsx(css.field, css.span)}>
                <span className={css.label} id="create-student-group-label">
                  {t("groupOptional")}
                </span>
                <Select
                  name="groupId"
                  variant="field"
                  defaultValue=""
                  options={groupOptions}
                  aria-labelledby="create-student-group-label"
                  disabled={createPending}
                />
              </div>
            ) : null}
          </div>
          <span className={css.hint}>
            {t("loginNewHint")} {t("passwordHint", { min: PASSWORD_MIN_LEN })}
          </span>
          <button type="submit" className={css.submit} disabled={createPending}>
            {createPending ? t("creating") : t("create")}
          </button>
        </form>

        {createState.status === "success" ? (
          <div className={css.credentials} role="status">
            <p className={clsx(css.alert, css.alertSuccess)}>
              {t("created", { name: createState.displayName })}
            </p>
            <p className={css.hint}>{t("credentialsOnce")}</p>
            <p className={css.hint}>
              {createState.mailSent
                ? t("mailSent", { email: createState.email })
                : t("mailFailed", { email: createState.email })}
            </p>
            <label className={css.field}>
              <span className={css.label}>{t("loginNew")}</span>
              <input
                className={css.input}
                readOnly
                value={createState.login}
                spellCheck={false}
              />
            </label>
            <label className={css.field}>
              <span className={css.label}>{t("email")}</span>
              <input
                className={css.input}
                readOnly
                value={createState.email}
                spellCheck={false}
              />
            </label>
            <label className={css.field}>
              <span className={css.label}>{t("password")}</span>
              <input
                className={css.input}
                readOnly
                value={createState.password}
                spellCheck={false}
                autoComplete="off"
              />
            </label>
            <button
              type="button"
              className={css.unlink}
              onClick={() => void copyCredentials()}
            >
              {credentialsCopied ? t("copied") : t("copyCredentials")}
            </button>
          </div>
        ) : null}

        {createEmailInvalid || createState.status === "error" ? (
          <p className={clsx(css.alert, css.alertError)} role="alert">
            {createEmailInvalid
              ? t("errors.invalid_email")
              : t(
                  `errors.${createState.status === "error" ? createState.code : "invalid_email"}`,
                )}
          </p>
        ) : null}
      </section>

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

        {assignState.status === "success" ? (
          <p className={clsx(css.alert, css.alertSuccess)} role="status">
            {t("groupSaved")}
          </p>
        ) : null}

        {assignState.status === "error" ? (
          <p className={clsx(css.alert, css.alertError)} role="alert">
            {t(`errors.${assignState.code}`)}
          </p>
        ) : null}

        {students.length === 0 ? (
          <p className={css.empty}>{t("empty")}</p>
        ) : (
          <ul className={css.list}>
            {students.map((student) => (
              <li key={student.studentUserId} className={css.item}>
                <div className={css.identity}>
                  <p className={css.name}>
                    <Link
                      className={css.nameLink}
                      href={`/students/${student.studentUserId}`}
                    >
                      {student.displayName}
                    </Link>
                  </p>
                  <p className={css.login}>@{student.login}</p>
                  {student.groupName ? (
                    <p className={css.groupBadge}>{student.groupName}</p>
                  ) : null}
                </div>
                {groups.length > 0 ? (
                  <form action={assignAction} className={css.assignForm}>
                    <input
                      type="hidden"
                      name="studentUserId"
                      value={student.studentUserId}
                    />
                    <Select
                      key={`${student.studentUserId}:${student.groupId ?? "none"}`}
                      name="groupId"
                      variant="compact"
                      defaultValue={
                        student.groupId == null ? "" : String(student.groupId)
                      }
                      options={groupOptions}
                      aria-label={t("assignGroup")}
                      disabled={assignPending}
                    />
                    <button
                      type="submit"
                      className={css.unlink}
                      disabled={assignPending}
                    >
                      {assignPending ? t("savingGroup") : t("saveGroup")}
                    </button>
                  </form>
                ) : null}
                <form
                  action={unlinkAction}
                  onSubmit={(event) => {
                    guardConfirmedSubmit(
                      event,
                      t("unlinkConfirm", {
                        name: student.displayName,
                        login: student.login,
                      }),
                    );
                  }}
                >
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
