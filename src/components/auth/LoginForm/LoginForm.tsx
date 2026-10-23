"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import clsx from "clsx";
import { PASSWORD_MAX_LEN, isValidEmailAddress } from "@/modules/auth/validateRegistration";
import { loginAction, type LoginActionState } from "@/modules/auth/actions";
import { focusNamedControl } from "../focusFormError";
import { PasswordInput } from "../PasswordInput/PasswordInput";
import css from "../auth.module.css";

const INITIAL: LoginActionState = { status: "idle" };

type LoginFormProps = {
  nextPath: string;
};

export function LoginForm({ nextPath }: LoginFormProps) {
  const t = useTranslations("LoginForm");
  const [state, formAction, pending] = useActionState(loginAction, INITIAL);
  const formRef = useRef<HTMLFormElement>(null);
  const alertRef = useRef<HTMLParagraphElement>(null);
  const [emailInvalid, setEmailInvalid] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    const email = String(new FormData(event.currentTarget).get("email") ?? "");
    if (!isValidEmailAddress(email)) {
      event.preventDefault();
      setEmailInvalid(true);
      focusNamedControl(formRef.current, "email");
      return;
    }
    setEmailInvalid(false);
  }

  useEffect(() => {
    if (state.status !== "error") return;
    if (state.code === "requiredFields" || state.code === "invalidCredentials") {
      if (focusNamedControl(formRef.current, "email")) return;
    }
    alertRef.current?.focus();
  }, [state]);

  return (
    <>
      <header className={css.intro}>
        <h1 className={css.title}>{t("title")}</h1>
        <p className={css.lead}>{t("lead")}</p>
      </header>

      <form ref={formRef} className={css.form} action={formAction} onSubmit={onSubmit}>
        <input type="hidden" name="next" value={nextPath} />

        <label className={css.field}>
          <span className={css.label}>{t("email")}</span>
          <input
            className={css.input}
            type="text"
            inputMode="email"
            name="email"
            autoComplete="email"
            spellCheck={false}
            required
            maxLength={255}
            disabled={pending}
            aria-invalid={emailInvalid || undefined}
            onChange={() => setEmailInvalid(false)}
          />
        </label>

        <label className={css.field}>
          <span className={css.label}>{t("password")}</span>
          <PasswordInput
            name="password"
            autoComplete="current-password"
            required
            maxLength={PASSWORD_MAX_LEN}
            disabled={pending}
          />
        </label>

        <p className={css.switch}>
          <Link href="/forgot-password" className={css.switchLink}>
            {t("forgotPassword")}
          </Link>
        </p>

        {emailInvalid || state.status === "error" ? (
          <p
            ref={alertRef}
            className={clsx(css.alert, css.alertError)}
            role="alert"
            tabIndex={-1}
          >
            {emailInvalid ? t("errors.invalidEmail") : t(`errors.${state.status === "error" ? state.code : "invalidEmail"}`)}
            {!emailInvalid && state.status === "error" && state.code === "emailUnverified" ? (
              <>
                {" "}
                <Link href="/register/check-email" className={css.switchLink}>
                  {t("resendVerifyLink")}
                </Link>
              </>
            ) : null}
          </p>
        ) : null}

        <button type="submit" className={css.submit} disabled={pending}>
          {pending ? t("signingIn") : t("signIn")}
        </button>
      </form>
    </>
  );
}
