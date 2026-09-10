"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState, useEffect } from "react";
import clsx from "clsx";
import {
  registerTeacherAction,
  type RegisterTeacherActionState,
} from "@/modules/payments/actions";
import { TEACHER_FEE_UAH, isSafeCheckoutUrl } from "@/modules/payments/constants";
import {
  PASSWORD_MAX_LEN,
  PASSWORD_MIN_LEN,
} from "@/modules/auth/validateRegistration";
import css from "../auth.module.css";

const INITIAL: RegisterTeacherActionState = { status: "idle" };

type TeacherRegisterFormProps = {
  paymentConfigured: boolean;
};

export function TeacherRegisterForm({
  paymentConfigured,
}: TeacherRegisterFormProps) {
  const t = useTranslations("TeacherRegister");
  const [state, formAction, pending] = useActionState(
    registerTeacherAction,
    INITIAL,
  );
  const paying = state.status === "pay";
  const busy = pending || paying;

  useEffect(() => {
    if (state.status !== "pay") return;
    if (!isSafeCheckoutUrl(state.pageUrl)) return;
    window.location.assign(state.pageUrl);
  }, [state]);

  return (
    <div className={css.card}>
      <header className={css.intro}>
        <p className={css.kicker}>{t("kicker")}</p>
        <h1 className={css.title}>{t("title")}</h1>
        <p className={css.lead}>{t("lead")}</p>
        <p className={css.feeChip}>{t("fee", { fee: TEACHER_FEE_UAH })}</p>
        <ul className={css.benefits}>
          <li>{t("benefits.mentor")}</li>
          <li>{t("benefits.progress")}</li>
          <li>{t("benefits.cabinet")}</li>
        </ul>
      </header>

      {paymentConfigured ? null : (
        <p className={clsx(css.alert, css.alertNotice)} role="status">
          {t("paymentNotConfigured")}
        </p>
      )}

      <form className={css.form} action={formAction}>
        <label className={css.field}>
          <span className={css.label}>{t("displayName")}</span>
          <input
            className={css.input}
            name="displayName"
            autoComplete="name"
            required
            minLength={2}
            maxLength={100}
            disabled={busy}
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
            disabled={busy}
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
            disabled={busy}
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
            disabled={busy}
          />
        </label>

        {state.status === "error" ? (
          <p className={clsx(css.alert, css.alertError)} role="alert">
            {t(`errors.${state.code}`)}
          </p>
        ) : null}

        <button type="submit" className={css.submit} disabled={busy}>
          {paying
            ? t("redirecting")
            : pending
              ? t("submitting")
              : paymentConfigured
                ? t("submitPay", { fee: TEACHER_FEE_UAH })
                : t("submitSave")}
        </button>
      </form>

      <p className={css.switch}>
        {t("haveAccount")}{" "}
        <Link href="/login" className={css.switchLink}>
          {t("signInLink")}
        </Link>
      </p>
      <p className={css.switch}>
        {t("studentPrompt")}{" "}
        <Link href="/register" className={css.switchLink}>
          {t("studentLink")}
        </Link>
      </p>
    </div>
  );
}
