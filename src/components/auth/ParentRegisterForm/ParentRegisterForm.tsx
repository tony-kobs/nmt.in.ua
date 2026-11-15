"use client";

import { useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import {
  registerParentAction,
  type RegisterParentActionState,
} from "@/modules/parent-students/actions";
import {
  isValidEmailAddress,
  PASSWORD_MAX_LEN,
  PASSWORD_MIN_LEN,
} from "@/modules/auth/validateRegistration";
import { focusNamedControl } from "../focusFormError";
import { PasswordInput } from "../PasswordInput/PasswordInput";
import css from "../auth.module.css";

const REGISTER_ERROR_FIELD: Record<string, string> = {
  requiredFields: "displayName",
  invalidDisplayName: "displayName",
  invalidEmail: "email",
  emailTaken: "email",
  passwordTooShort: "password",
  passwordTooLong: "password",
  passwordMismatch: "passwordConfirm",
};

const INITIAL: RegisterParentActionState = { status: "idle" };

type ParentRegisterFormProps = { token: string };

export function ParentRegisterForm({ token }: ParentRegisterFormProps) {
  const t = useTranslations("RegisterForm");
  const parent = useTranslations("ParentRegister");
  const [state, formAction, pending] = useActionState(registerParentAction, INITIAL);
  const invalidInvite = state.status === "error" && state.code === "invalidInvite";
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

  function onEmailInvalid(event: FormEvent<HTMLInputElement>) {
    if (event.currentTarget.validity.valueMissing) return;
    event.preventDefault();
    setEmailInvalid(true);
  }

  useEffect(() => {
    if (state.status !== "error") return;
    const field = REGISTER_ERROR_FIELD[state.code];
    if (field && focusNamedControl(formRef.current, field)) return;
    alertRef.current?.focus();
  }, [state]);

  return (
    <>
      <header className={css.intro}>
        <h1 className={css.title}>{parent("title")}</h1>
        <p className={css.lead}>{parent("lead")}</p>
      </header>

      <form ref={formRef} className={css.form} action={formAction} onSubmit={onSubmit} aria-busy={pending}>
        <input type="hidden" name="token" value={token} />

        <label className={css.field}>
          <span className={css.label}>{t("displayName")}</span>
          <input
            className={css.input}
            name="displayName"
            autoComplete="name"
            required
            minLength={2}
            maxLength={100}
            disabled={pending || invalidInvite}
          />
        </label>

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
            disabled={pending || invalidInvite}
            aria-invalid={emailInvalid || undefined}
            onInvalid={onEmailInvalid}
            onChange={() => setEmailInvalid(false)}
          />
          <span className={css.hint}>{t("emailHint")}</span>
        </label>

        <label className={css.field}>
          <span className={css.label}>{t("password")}</span>
          <PasswordInput
            name="password"
            autoComplete="new-password"
            required
            minLength={PASSWORD_MIN_LEN}
            maxLength={PASSWORD_MAX_LEN}
            disabled={pending || invalidInvite}
          />
          <span className={css.hint}>
            {t("passwordHint", { min: PASSWORD_MIN_LEN })}
          </span>
        </label>

        <label className={css.field}>
          <span className={css.label}>{t("passwordConfirm")}</span>
          <PasswordInput
            name="passwordConfirm"
            autoComplete="new-password"
            required
            minLength={PASSWORD_MIN_LEN}
            maxLength={PASSWORD_MAX_LEN}
            disabled={pending || invalidInvite}
          />
        </label>

        {emailInvalid || state.status === "error" ? (
          <p
            ref={alertRef}
            className={clsx(css.alert, css.alertError)}
            role="alert"
            tabIndex={-1}
          >
            {emailInvalid
              ? t("errors.invalidEmail")
              : invalidInvite
                ? parent("invalidMessage")
                : t(`errors.${state.status === "error" ? state.code : "invalidEmail"}`)}
          </p>
        ) : null}

        <button type="submit" className={css.submit} disabled={pending || invalidInvite}>
          {pending ? t("submitting") : parent("submit")}
        </button>
      </form>
    </>
  );
}
