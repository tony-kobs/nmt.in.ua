"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import clsx from "clsx";
import {
  registerAction,
  type RegisterActionState,
} from "@/modules/auth/actions";
import {
  PASSWORD_MAX_LEN,
  PASSWORD_MIN_LEN,
} from "@/modules/auth/validateRegistration";
import css from "../auth.module.css";

const INITIAL: RegisterActionState = { status: "idle" };

type RegisterFormProps = {
  nextPath: string;
  /** Set when arriving via `/register?from=diagnostic` — lets `registerAction`
   * claim the guest's diagnostic progress after a successful signup. */
  from?: "diagnostic";
};

export function RegisterForm({ nextPath, from }: RegisterFormProps) {
  const t = useTranslations("RegisterForm");
  const [state, formAction, pending] = useActionState(registerAction, INITIAL);

  return (
    <div className={css.card}>
      <header className={css.intro}>
        <p className={css.kicker}>{t("kicker")}</p>
        <h1 className={css.title}>{t("title")}</h1>
        <p className={css.lead}>
          {from === "diagnostic" ? t("leadFromDiagnostic") : t("lead")}
        </p>
      </header>

      <form className={css.form} action={formAction}>
        <input type="hidden" name="next" value={nextPath} />
        <input type="hidden" name="from" value={from ?? ""} />

        <label className={css.field}>
          <span className={css.label}>{t("displayName")}</span>
          <input
            className={css.input}
            name="displayName"
            autoComplete="name"
            required
            minLength={2}
            maxLength={100}
            disabled={pending}
          />
        </label>

        <label className={css.field}>
          <span className={css.label}>{t("login")}</span>
          <input
            className={css.input}
            name="login"
            autoComplete="username"
            required
            minLength={3}
            maxLength={50}
            pattern="[A-Za-z0-9][A-Za-z0-9._-]{1,48}[A-Za-z0-9]|[A-Za-z0-9]{3,50}"
            title={t("loginHint")}
            disabled={pending}
          />
          <span className={css.hint}>{t("loginHint")}</span>
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
            disabled={pending}
          />
          <span className={css.hint}>
            {t("passwordHint", { min: PASSWORD_MIN_LEN })}
          </span>
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
            disabled={pending}
          />
        </label>

        {state.status === "error" ? (
          <p className={clsx(css.alert, css.alertError)} role="alert">
            {t(`errors.${state.code}`)}
          </p>
        ) : null}

        <button type="submit" className={css.submit} disabled={pending}>
          {pending ? t("submitting") : t("submit")}
        </button>
      </form>

      <p className={css.switch}>
        {t("haveAccount")}{" "}
        <Link href="/login" className={css.switchLink}>
          {t("signInLink")}
        </Link>
      </p>
      <p className={css.switch}>
        {t("teacherPrompt")}{" "}
        <Link href="/register/teacher" className={css.switchLink}>
          {t("teacherLink")}
        </Link>
      </p>
    </div>
  );
}
