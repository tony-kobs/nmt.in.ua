"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState } from "react";
import clsx from "clsx";
import { PASSWORD_MAX_LEN } from "@/modules/auth/validateRegistration";
import { loginAction, type LoginActionState } from "@/modules/auth/actions";
import css from "../auth.module.css";

const INITIAL: LoginActionState = { status: "idle" };

type LoginFormProps = {
  nextPath: string;
};

export function LoginForm({ nextPath }: LoginFormProps) {
  const t = useTranslations("LoginForm");
  const [state, formAction, pending] = useActionState(loginAction, INITIAL);

  const registerHref =
    nextPath === "/"
      ? "/register"
      : `/register?next=${encodeURIComponent(nextPath)}`;

  return (
    <div className={css.card}>
      <header className={css.intro}>
        <p className={css.kicker}>{t("kicker")}</p>
        <h1 className={css.title}>{t("title")}</h1>
        <p className={css.lead}>{t("lead")}</p>
      </header>

      <form className={css.form} action={formAction}>
        <input type="hidden" name="next" value={nextPath} />

        <label className={css.field}>
          <span className={css.label}>{t("login")}</span>
          <input
            className={css.input}
            name="login"
            autoComplete="username"
            required
            disabled={pending}
          />
        </label>

        <label className={css.field}>
          <span className={css.label}>{t("password")}</span>
          <input
            className={css.input}
            type="password"
            name="password"
            autoComplete="current-password"
            required
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
          {pending ? t("signingIn") : t("signIn")}
        </button>
      </form>

      <p className={css.switch}>
        {t("noAccount")}{" "}
        <Link href={registerHref} className={css.switchLink}>
          {t("registerLink")}
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
