"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import {
  PASSWORD_MAX_LEN,
  PASSWORD_MIN_LEN,
} from "@/modules/auth/validateRegistration";
import {
  resetPasswordAction,
  type ResetPasswordActionState,
} from "@/modules/auth/actions";
import { PasswordInput } from "../PasswordInput/PasswordInput";
import css from "../auth.module.css";

const INITIAL: ResetPasswordActionState = { status: "idle" };

type ResetPasswordFormProps = {
  token: string;
};

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const t = useTranslations("ResetPassword");
  const router = useRouter();
  const [state, action, pending] = useActionState(resetPasswordAction, INITIAL);

  useEffect(() => {
    if (state.status === "ok") {
      const timer = window.setTimeout(() => router.replace("/login"), 1500);
      return () => window.clearTimeout(timer);
    }
  }, [state, router]);

  if (!token) {
    return (
      <div className={css.card}>
        <header className={css.intro}>
          <h1 className={css.title}>{t("title")}</h1>
          <p className={css.lead}>{t("errors.invalid_token")}</p>
        </header>
        <p className={css.switch}>
          <Link href="/forgot-password" className={css.switchLink}>
            {t("requestNew")}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className={css.card}>
      <header className={css.intro}>
        <p className={css.kicker}>{t("kicker")}</p>
        <h1 className={css.title}>{t("title")}</h1>
        <p className={css.lead}>{t("lead")}</p>
      </header>

      <form className={css.form} action={action}>
        <input type="hidden" name="token" value={token} />
        <label className={css.field}>
          <span className={css.label}>{t("password")}</span>
          <PasswordInput
            name="password"
            autoComplete="new-password"
            required
            minLength={PASSWORD_MIN_LEN}
            maxLength={PASSWORD_MAX_LEN}
            disabled={pending}
          />
        </label>
        <label className={css.field}>
          <span className={css.label}>{t("passwordConfirm")}</span>
          <PasswordInput
            name="passwordConfirm"
            autoComplete="new-password"
            required
            minLength={PASSWORD_MIN_LEN}
            maxLength={PASSWORD_MAX_LEN}
            disabled={pending}
          />
        </label>

        {state.status === "ok" ? (
          <p className={clsx(css.alert, css.alertSuccess)} role="status">
            {t("success")}
          </p>
        ) : null}
        {state.status === "error" ? (
          <p className={clsx(css.alert, css.alertError)} role="alert">
            {t(`errors.${state.code}`)}
          </p>
        ) : null}

        <button type="submit" className={css.submit} disabled={pending}>
          {pending ? t("submitting") : t("submit")}
        </button>
      </form>
    </div>
  );
}
